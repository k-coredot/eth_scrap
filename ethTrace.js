
var DateUtils = require('date-utils');
var FS = require('fs');
var Web3 = require('web3');

const web3 = new Web3(new Web3.providers.HttpProvider('http://172.16.1.89:8545'));


const sTmrInterval = 150;
const rpcCallMaxCount = 6;
var rpcCallCount = 0;

//var curBlockNum = 46147; 첫 트랜잭션 블록
var curBlockNum = 150000;
const lastBlockNum = 199999;

var sTmrBlock = setInterval(() => {
    if (rpcCallCount < rpcCallMaxCount) {

        if (curBlockNum % 100 == 0) {
            var dateStr = (new Date()).toFormat('YYYY-MM-DD HH24:MI:SS');
            console.log("GET BLOCK [" + curBlockNum + "] : " + dateStr)
        }

        getBlock(curBlockNum++);

        if (curBlockNum > lastBlockNum) {
            clearInterval(sTmrBlock);
        }
    }
}, sTmrInterval);

function getBlock(blockNum) {
    rpcCallCount++;
    web3.eth.getBlock(blockNum, true, function (err, block) {
        rpcCallCount--;
        if (!err && block != null && block.transactions != null) {
            //순차적으로 가져오도록.. 블록에 트랜잭션이 너무 많을때... 루프로 처리하면 한꺼번에 요청하게 되므로 EVM이 따라가지 못하는 현상이 발생하게 된다.
            var i = 0;
            var sTmrTx = setInterval(() => {
                if (rpcCallCount < rpcCallMaxCount) {
                    getTxReceipt(block, block.transactions[i++]);
                    if (i >= block.transactions.length) {
                        clearInterval(sTmrTx);
                    }
                }
            }, sTmrInterval);
        } else {
            console.log("ERROR_GET_BLOCK " + blockNum);
            logErrorFile("ERROR_GET_BLOCK," + blockNum + "\r\n", blockNum);
        }
    });
}

function getTxReceipt(block, tx) {
    if (block != null && tx != null && tx.hash != null) {
        rpcCallCount++;
        web3.eth.getTransactionReceipt(tx.hash, function (err, receipt) {
            rpcCallCount--;
            if (!err && receipt != null) {
                traceTx(block, tx, receipt);
            } else {
                rpcCallCount++;
                web3.eth.getTransactionReceipt(tx.hash, function (err2, receipt2) {
                    rpcCallCount--;
                    if (!err2 && receipt2 != null) {
                        traceTx(block, tx, receipt2);
                    } else {
                        console.log("ERROR_GET_TX_RECEIPT " + block.number + " " + tx.hash);
                        logErrorFile("ERROR_GET_TX_RECEIPT," + block.number + "," + tx.hash + "\r\n", block.number);
                    }
                });
            }
        });
    }
}

function traceTx(block, tx, receipt) {
    if (block != null && tx != null && tx.hash != null && receipt != null) {
        rpcCallCount++;
        web3.currentProvider.send({ "jsonrpc": "2.0", "method": "debug_traceTransaction", "params": [tx.hash, { "tracer": "callTracer" }], "id": 1 }, function (error, resp) {
            rpcCallCount--;
            if (!error && resp != null && resp.result != null) {

                logTxInfo(block, tx, receipt, resp.result, 0);

                if (resp.result.calls != null) {
                    traceTxInternalRecursive(block, tx, receipt, resp.result.calls, 0);
                }
            } else {
                // if fail.. try once more
                rpcCallCount++;
                web3.currentProvider.send({ "jsonrpc": "2.0", "method": "debug_traceTransaction", "params": [tx.hash, { "tracer": "callTracer" }], "id": 1 }, function (error2, resp2) {
                    rpcCallCount--;
                    if (!error2 && resp2 != null && resp2.result != null) {

                        logTxInfo(block, tx, receipt, resp.result, 0);

                        if (resp2.result.calls != null) {
                            traceTxInternalRecursive(block, tx, receipt, resp2.result.calls, 0);
                        }
                    } else {
                        // if fail.. log transaction info.. and try later...
                        console.log("ERROR TRACE_TX " + block.number + " " + tx.hash);
                        logErrorFile("ERROR TRACE_TX," + block.number + "," + tx.hash + "\r\n", block.number);
                    }
                });
            }
        });
    }
}
function traceTxInternalRecursive(block, tx, receipt, traceNode, prevCallIdx) {
    if (block != null && tx != null && receipt != null && traceNode != null && traceNode.length > 0) {
        for (var i = 0; i < traceNode.length; i++) {
            if (block != null && tx != null && receipt != null && traceNode[i] != null && traceNode[i].value != null && traceNode[i].value != '0x0') {
                logTxInfo(block, tx, receipt, traceNode[i], ++prevCallIdx);
            }
        }
        for (var i = 0; i < traceNode.length; i++) {
            if (traceNode[i].calls != null) {
                traceTxInternalRecursive(block, tx, receipt, traceNode[i].calls, prevCallIdx);
            }
        }
    }
}

function logTxInfo(block, tx, receipt, call, callIdx) {
    if (block != null && tx != null && receipt != null && call != null && call.value != null && call.value != '0x0') {
        /*
         * 트랜잭션 트레이싱 (이더의 변화가 있는 경우만) 테이블
         * BlockNum, TxHash, TxIdx, TxInternalIdx, FromAddr, ToAddre, Value, Gas, Time, MinerAddr
         * 
         * 블록단위 잔고 변동 계정목록과 그 시점의 잔고 테이블
         * BlockNum, Addr, Balance, Time, Change
         */
        /*
        console.log("BLOCK NUM :" + block.number);
        console.log("TX HASH :" + tx.hash);
        console.log("TX IDX :" + tx.transactionIndex);
        console.log("FROM :" + call.from);
        console.log("TO : " + call.to);
        console.log("VALUE : " + web3.utils.toBN(call.value).toString());
        console.log("GAS USED : " + web3.utils.toBN(receipt.gasUsed).toString());
        */

        var info = "";
        if (callIdx == 0) {
            info = block.number + "," +
                tx.hash + "," +
                tx.transactionIndex + "," +
                callIdx + "," +
                call.from + "," +
                call.to + "," +
                web3.utils.toBN(call.value).toString() + "," +
                web3.utils.toBN(receipt.gasUsed * tx.gasPrice).toString() + "," +
                block.timestamp + "," +
                block.miner + "\r\n";
        } else {
            info = block.number + "," +
                tx.hash + "," +
                tx.transactionIndex + "," +
                callIdx + "," +
                call.from + "," +
                call.to + "," +
                web3.utils.toBN(call.value).toString() + "," +
                0 + "," +
                block.timestamp + "," +
                block.miner + "\r\n";
        }
        var logfile = "C:\\Users\\hyeok\\projects\\crawl2\\ethcrawl" + Math.floor(block.number / 1000) + ".csv";
        fs.appendFile(logfile, info, (err) => {
            if (err) {
                console.error(err);
                return;
            }
        });
    }
}

function logErrorFile(logtxt, blockNum) {
    var logfile = "C:\\Users\\hyeok\\projects\\crawl2\\ethcrawl" + Math.floor(blockNum / 1000) + "_err.csv";
    fs.appendFile(logfile, logtxt, (err) => {
        if (err) {
            console.error(err);
            return;
        }
    });
}
