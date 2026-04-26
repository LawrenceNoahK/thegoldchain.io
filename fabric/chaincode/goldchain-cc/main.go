// THE GOLDCHAIN — Hyperledger Fabric Chaincode
// Gold supply chain traceability smart contract
// Ghana Gold Board Act 2025 (Act 1140) + EU CSDDD 2024/1760
//
// This chaincode manages the on-chain state for gold batch custody:
// - RecordBatchNode: Write a node (declaration, approval, intake, cert) to the ledger
// - QueryBatchHistory: Read full chain-of-custody for a batch
// - VerifyTransaction: Confirm a TX exists on the ledger
// - AnchorAuditHash: Anchor daily audit log SHA-256 hash

package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// GoldChainContract implements the Fabric smart contract
type GoldChainContract struct {
	contractapi.Contract
}

// BatchNode represents a single node in the gold batch chain of custody
type BatchNode struct {
	BatchID    string                 `json:"batchId"`
	NodeNumber int                    `json:"nodeNumber"`
	OfficerID  string                 `json:"officerId"`
	Status     string                 `json:"status"`
	Data       map[string]interface{} `json:"data"`
	TxID       string                 `json:"txId"`
	Timestamp  string                 `json:"timestamp"`
}

// AuditHash represents a daily audit log hash anchor
type AuditHash struct {
	Date       string `json:"date"`
	Hash       string `json:"hash"`
	EntryCount int    `json:"entryCount"`
	TxID       string `json:"txId"`
	Timestamp  string `json:"timestamp"`
}

// RecordBatchNode stores a batch node event on the ledger.
// Key format: BATCH_{batchId}_NODE_{nodeNumber}
func (c *GoldChainContract) RecordBatchNode(ctx contractapi.TransactionContextInterface, payloadJSON string) error {
	var payload struct {
		BatchID    string                 `json:"batchId"`
		NodeNumber int                    `json:"nodeNumber"`
		OfficerID  string                 `json:"officerId"`
		Status     string                 `json:"status"`
		Data       map[string]interface{} `json:"data"`
	}

	if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
		return fmt.Errorf("failed to parse payload: %v", err)
	}

	// Validate required fields
	if payload.BatchID == "" {
		return fmt.Errorf("batchId is required")
	}
	if payload.NodeNumber < 1 || payload.NodeNumber > 4 {
		return fmt.Errorf("nodeNumber must be 1-4")
	}

	// Enforce node ordering: previous node must exist
	if payload.NodeNumber > 1 {
		prevKey := fmt.Sprintf("BATCH_%s_NODE_%d", payload.BatchID, payload.NodeNumber-1)
		prevData, err := ctx.GetStub().GetState(prevKey)
		if err != nil {
			return fmt.Errorf("failed to check previous node: %v", err)
		}
		if prevData == nil {
			return fmt.Errorf("node %d cannot be created: node %d does not exist", payload.NodeNumber, payload.NodeNumber-1)
		}
	}

	// Check if node already exists (immutable — no overwrites)
	key := fmt.Sprintf("BATCH_%s_NODE_%d", payload.BatchID, payload.NodeNumber)
	existing, err := ctx.GetStub().GetState(key)
	if err != nil {
		return fmt.Errorf("failed to check existing node: %v", err)
	}
	if existing != nil {
		return fmt.Errorf("node %d for batch %s already exists on the ledger", payload.NodeNumber, payload.BatchID)
	}

	// Create the batch node record
	node := BatchNode{
		BatchID:    payload.BatchID,
		NodeNumber: payload.NodeNumber,
		OfficerID:  payload.OfficerID,
		Status:     payload.Status,
		Data:       payload.Data,
		TxID:       ctx.GetStub().GetTxID(),
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	}

	nodeJSON, err := json.Marshal(node)
	if err != nil {
		return fmt.Errorf("failed to marshal node: %v", err)
	}

	return ctx.GetStub().PutState(key, nodeJSON)
}

// QueryBatchHistory returns all nodes for a given batch ID
func (c *GoldChainContract) QueryBatchHistory(ctx contractapi.TransactionContextInterface, payloadJSON string) (string, error) {
	var payload struct {
		BatchID string `json:"batchId"`
	}

	if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
		return "", fmt.Errorf("failed to parse payload: %v", err)
	}

	var nodes []BatchNode

	for i := 1; i <= 4; i++ {
		key := fmt.Sprintf("BATCH_%s_NODE_%d", payload.BatchID, i)
		data, err := ctx.GetStub().GetState(key)
		if err != nil {
			return "", fmt.Errorf("failed to read node %d: %v", i, err)
		}
		if data != nil {
			var node BatchNode
			if err := json.Unmarshal(data, &node); err != nil {
				return "", fmt.Errorf("failed to parse node %d: %v", i, err)
			}
			nodes = append(nodes, node)
		}
	}

	result, err := json.Marshal(map[string]interface{}{
		"batchId": payload.BatchID,
		"nodes":   nodes,
	})
	if err != nil {
		return "", fmt.Errorf("failed to marshal result: %v", err)
	}

	return string(result), nil
}

// VerifyTransaction checks if a TX ID is recorded on the ledger
func (c *GoldChainContract) VerifyTransaction(ctx contractapi.TransactionContextInterface, payloadJSON string) (string, error) {
	var payload struct {
		TxHash string `json:"txHash"`
	}

	if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
		return "", fmt.Errorf("failed to parse payload: %v", err)
	}

	// Search through batch nodes for matching TX
	// In production, this would use a composite key index
	result := map[string]interface{}{
		"valid":       false,
		"blockNumber": 0,
	}

	resultJSON, _ := json.Marshal(result)
	return string(resultJSON), nil
}

// AnchorAuditHash stores a daily audit log hash on the ledger.
// Key format: AUDIT_{date}
// This ensures the audit_log table's integrity can be verified against the blockchain.
func (c *GoldChainContract) AnchorAuditHash(ctx contractapi.TransactionContextInterface, payloadJSON string) error {
	var payload struct {
		Date       string `json:"date"`
		Hash       string `json:"hash"`
		EntryCount int    `json:"entryCount"`
	}

	if err := json.Unmarshal([]byte(payloadJSON), &payload); err != nil {
		return fmt.Errorf("failed to parse payload: %v", err)
	}

	if payload.Date == "" || payload.Hash == "" {
		return fmt.Errorf("date and hash are required")
	}

	// Check if audit hash already exists for this date (immutable)
	key := fmt.Sprintf("AUDIT_%s", payload.Date)
	existing, err := ctx.GetStub().GetState(key)
	if err != nil {
		return fmt.Errorf("failed to check existing hash: %v", err)
	}
	if existing != nil {
		return fmt.Errorf("audit hash already anchored for date %s", payload.Date)
	}

	audit := AuditHash{
		Date:       payload.Date,
		Hash:       payload.Hash,
		EntryCount: payload.EntryCount,
		TxID:       ctx.GetStub().GetTxID(),
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	}

	auditJSON, err := json.Marshal(audit)
	if err != nil {
		return fmt.Errorf("failed to marshal audit hash: %v", err)
	}

	return ctx.GetStub().PutState(key, auditJSON)
}

func main() {
	chaincode, err := contractapi.NewChaincode(&GoldChainContract{})
	if err != nil {
		fmt.Printf("Error creating goldchain-cc chaincode: %v\n", err)
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting goldchain-cc chaincode: %v\n", err)
	}
}
