import unittest
import uuid
from core.merger import apply_transactions

class TestMerger(unittest.TestCase):

    def setUp(self):
        self.empty_portfolio = {
            "calendar_year": 2024,
            "stocks": [],
            "overrides": {},
            "sbi_rate_overrides": {}
        }

    def test_basic_buy(self):
        txs = [{"type": "BUY", "date": "2024-01-01", "symbol": "TEST", "qty": 10, "price": 100}]
        res = apply_transactions(self.empty_portfolio, txs)
        self.assertEqual(len(res["stocks"]), 1)
        self.assertEqual(res["stocks"][0]["lots"][0]["quantity"], 10)

    def test_quantity_aggregation(self):
        # Scenario: 5 shares sold (G&L) and 5 shares remaining (Holdings) for the same lot
        portfolio = {
            "calendar_year": 2024,
            "stocks": [{
                "id": "1",
                "ticker": "TEST",
                "lots": [{
                    "id": "L1",
                    "buy_date": "2024-01-01",
                    "quantity": 5.0, # Existing from partial import
                    "buy_price": 100.0,
                    "sells": []
                }]
            }]
        }
        # New transaction adding more quantity to same lot
        txs = [{"type": "BUY", "date": "2024-01-01", "symbol": "TEST", "qty": 5, "price": 100}]
        res = apply_transactions(portfolio, txs)
        self.assertEqual(res["stocks"][0]["lots"][0]["quantity"], 10.0)

    def test_linked_sell_aggregation(self):
        # Scenario: G&L report shows a sell of 2 shares from a lot bought on 2024-01-01
        txs = [{
            "type": "SELL", 
            "date": "2024-06-01", 
            "symbol": "TEST", 
            "qty": 2, 
            "price": 150,
            "buy_date": "2024-01-01",
            "buy_price": 100
        }]
        res = apply_transactions(self.empty_portfolio, txs)
        lot = res["stocks"][0]["lots"][0]
        self.assertEqual(lot["quantity"], 2.0)
        self.assertEqual(len(lot["sells"]), 1)

        # Second import (Holdings) says 8 shares remaining for that same lot
        txs2 = [{"type": "BUY", "date": "2024-01-01", "symbol": "TEST", "qty": 8, "price": 100}]
        res2 = apply_transactions(res, txs2)
        lot2 = res2["stocks"][0]["lots"][0]
        self.assertEqual(lot2["quantity"], 10.0) # 2 (sold) + 8 (remaining)

    def test_user_controlled_duplicates(self):
        # If user leaves a duplicate checked in UI, the engine trusts them and adds it.
        txs = [{"type": "BUY", "date": "2024-01-01", "symbol": "TEST", "qty": 10, "price": 100}]
        res = apply_transactions(self.empty_portfolio, txs)
        res2 = apply_transactions(res, txs)
        # 10 + 10 = 20
        self.assertEqual(res2["stocks"][0]["lots"][0]["quantity"], 20.0)

    def test_fifo_sell(self):
        portfolio = {
            "calendar_year": 2024,
            "stocks": [{
                "ticker": "TEST",
                "lots": [
                    {"id": "L1", "buy_date": "2024-01-01", "quantity": 10, "buy_price": 50, "sells": []},
                    {"id": "L2", "buy_date": "2024-02-01", "quantity": 10, "buy_price": 60, "sells": []}
                ]
            }]
        }
        txs = [{"type": "SELL", "date": "2024-05-01", "symbol": "TEST", "qty": 15, "price": 200}]
        res = apply_transactions(portfolio, txs)
        stock = res["stocks"][0]
        self.assertEqual(len(stock["lots"][0]["sells"]), 1)
        self.assertEqual(stock["lots"][0]["sells"][0]["quantity"], 10)
        self.assertEqual(stock["lots"][1]["sells"][0]["quantity"], 5)

    def test_dd_mm_yyyy_chronological_sorting(self):
        # Scenario: Lots are imported or created in non-chronological order or with dd/mm/yyyy dates
        # "31/01/2022" should sort BEFORE "20/11/2025" and "05/03/2023" should be in between
        portfolio = {
            "calendar_year": 2025,
            "stocks": [{
                "ticker": "TEST",
                "lots": []
            }]
        }
        txs = [
            {"type": "BUY", "date": "20/11/2025", "symbol": "TEST", "qty": 10, "price": 100},
            {"type": "BUY", "date": "31/01/2022", "symbol": "TEST", "qty": 5, "price": 90},
            {"type": "BUY", "date": "05/03/2023", "symbol": "TEST", "qty": 8, "price": 95}
        ]
        res = apply_transactions(portfolio, txs)
        lots = res["stocks"][0]["lots"]
        self.assertEqual(len(lots), 3)
        # Verify correct chronological order
        self.assertEqual(lots[0]["buy_date"], "31/01/2022")
        self.assertEqual(lots[1]["buy_date"], "05/03/2023")
        self.assertEqual(lots[2]["buy_date"], "20/11/2025")

    def test_fifo_sell_with_dd_mm_yyyy(self):
        # Scenario: Under alphabetical string sorting, "31/01/2022" sorts after "20/11/2025" because "3" > "2".
        # We must verify that FIFO properly matches the older lot first (31/01/2022) before the newer lot (20/11/2025).
        portfolio = {
            "calendar_year": 2025,
            "stocks": [{
                "ticker": "TEST",
                "lots": [
                    {"id": "L1", "buy_date": "20/11/2025", "quantity": 10, "buy_price": 100, "sells": []},
                    {"id": "L2", "buy_date": "31/01/2022", "quantity": 10, "buy_price": 50, "sells": []}
                ]
            }]
        }
        # First, ensure apply_transactions will re-sort the lots in portfolio chronologically
        txs_sort = [{"type": "BUY", "date": "31/01/2022", "symbol": "TEST", "qty": 0, "price": 50}]
        portfolio = apply_transactions(portfolio, txs_sort)
        
        # Check that lots are sorted chronologically: L2 ("31/01/2022") must be first, L1 ("20/11/2025") second.
        self.assertEqual(portfolio["stocks"][0]["lots"][0]["buy_date"], "31/01/2022")
        self.assertEqual(portfolio["stocks"][0]["lots"][1]["buy_date"], "20/11/2025")

        # Now sell 15 shares. It should consume 10 shares from L2 (31/01/2022) and 5 shares from L1 (20/11/2025)
        txs_sell = [{"type": "SELL", "date": "10/12/2025", "symbol": "TEST", "qty": 15, "price": 150}]
        res = apply_transactions(portfolio, txs_sell)
        
        stock = res["stocks"][0]
        # L2 (31/01/2022) is index 0
        self.assertEqual(stock["lots"][0]["buy_date"], "31/01/2022")
        self.assertEqual(len(stock["lots"][0]["sells"]), 1)
        self.assertEqual(stock["lots"][0]["sells"][0]["quantity"], 10)
        
        # L1 (20/11/2025) is index 1
        self.assertEqual(stock["lots"][1]["buy_date"], "20/11/2025")
        self.assertEqual(len(stock["lots"][1]["sells"]), 1)
        self.assertEqual(stock["lots"][1]["sells"][0]["quantity"], 5)

if __name__ == "__main__":
    unittest.main()
