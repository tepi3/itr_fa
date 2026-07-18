import pytest

from core.etrade_parser import _parse_etrade_pdf_text, _pdf_transactions_to_target_year


@pytest.mark.unit
def test_parse_new_morgan_stanley_pdf_text_with_duplicate_transfer_lots():
    pages = [
        """
        CLIENT STATEMENT
        2025 Recap of Cash Management Activity
        SECURITY TRANSFERS
        Activity Date Activity Type Security (Symbol) Comments Quantity Accrued Interest Amount
        5/21 Transfer into Account QUALCOMM INC 14.000 2,118.34
        5/21 Transfer into Account QUALCOMM INC 14.000 2,118.34
        TOTAL SECURITY TRANSFERS $4,236.68
        """,
        """
        Account Detail
        CLIENT STATEMENT For the Period May 1-31, 2025
        ACTIVITY
        TRANSFERS, CORPORATE ACTIONS AND ADDITIONAL ACTIVITY
        SECURITY TRANSFERS
        5/21 Transfer into Account QUALCOMM INC 14.000 $2,118.34
        5/21 Transfer into Account QUALCOMM INC 14.000 2,118.34
        """,
        """
        Account Detail
        CLIENT STATEMENT For the Period December 1-31, 2025
        STOCKS
        COMMON STOCKS
        Security Description Quantity Share Price Total Cost Market Value
        QUALCOMM INC (QCOM) Purchases 28.000 $171.050 $4,236.68 $4,789.40 $552.72
        ACTIVITY
        CASH FLOW ACTIVITY BY DATE
        Activity
        Date
        Settlement
        Date Activity Type Description Comments Quantity Price Credits/(Debits)
        12/18 Dividend Reinvestment QUALCOMM INC ACTED AS AGENT
        DIVIDEND REINVESTMENT
        2.739 175.0909 (479.57)
        """,
    ]

    raw = _parse_etrade_pdf_text(pages, 2025)

    transfer_rows = [
        tx for tx in raw
        if tx["type"] == "BUY" and tx["date"] == "21/05/2025" and tx["qty"] == 14.0
    ]
    assert len(transfer_rows) == 2
    assert transfer_rows[0]["symbol"] == "QCOM"
    assert transfer_rows[0]["price"] == 151.31
    assert any(tx["date"] == "18/12/2025" and tx["qty"] == 2.739 for tx in raw)


@pytest.mark.unit
def test_parse_legacy_etrade_pdf_text_receive_reinvest_and_sold():
    pages = [
        """
        PAGE 7 OF 8
        Account Number: 3604-5268 Statement Period : April 1, 2022 - May 31, 2022 Account Type: INDIVIDUAL
        UNVESTED RESTRICTED STOCKS
        10/28/2020 RU518715 RSU QCOM StkPln 69 $0.00 $143.22 $7,585.86
        TRANSACTION HISTORY
        SECURITIES PURCHASED OR SOLD
        TRADE
        DATE
        05/23/22
        09:30
        05/25/22 QUALCOMM INC QCOM Sold -4 129.9500 519.15
        OTHER ACTIVITY
        05/24/22 QUALCOMM INC
        RAND 351311928
        QCOM Receive 11
        05/26/22 QUALCOMM INC
        REIN @ 117.5497
        REC 05/01/22 PAY 05/26/22
        QCOM Div Reinvest 1.504 176.80
        """,
    ]

    raw = _parse_etrade_pdf_text(pages, 2022)

    assert any(
        tx["type"] == "SELL"
        and tx["date"] == "23/05/2022"
        and tx.get("_order_date") == "25/05/2022"
        and tx["symbol"] == "QCOM"
        and tx["qty"] == 4.0
        and tx["price"] == 129.95
        for tx in raw
    )
    assert any(
        tx == {"type": "BUY", "date": "24/05/2022", "symbol": "QCOM", "qty": 11.0, "price": 143.22}
        for tx in raw
    )
    assert any(
        tx == {"type": "BUY", "date": "26/05/2022", "symbol": "QCOM", "qty": 1.504, "price": 117.5497}
        for tx in raw
    )


@pytest.mark.unit
def test_pdf_transactions_fifo_carries_pre_year_sells_and_links_target_year_sells():
    raw = [
        {"type": "BUY", "date": "01/01/2024", "symbol": "QCOM", "qty": 10.0, "price": 100.0},
        {"type": "SELL", "date": "01/06/2024", "symbol": "QCOM", "qty": 3.0, "price": 110.0},
        {"type": "SELL", "date": "01/06/2025", "symbol": "QCOM", "qty": 2.0, "price": 120.0},
    ]

    txs, skipped = _pdf_transactions_to_target_year(raw, 2025)

    assert skipped == 0
    assert txs[0] == {"type": "BUY", "date": "01/01/2024", "symbol": "QCOM", "qty": 7.0, "price": 100.0}
    assert txs[1] == {
        "type": "SELL",
        "date": "01/06/2025",
        "symbol": "QCOM",
        "qty": 2.0,
        "price": 120.0,
        "buy_date": "01/01/2024",
        "buy_price": 100.0,
    }
