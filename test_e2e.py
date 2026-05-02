import requests
import json
import os

BASE_URL = "http://127.0.0.1:5000/api"

def test_qcom_vwra():
    print("Testing QCOM and VWRA flow...")

    # 1. Lookup QCOM
    res = requests.post(f"{BASE_URL}/lookup-stock", json={"ticker": "QCOM"})
    assert res.status_code == 200
    qcom_info = res.json()
    print("QCOM Info:", qcom_info["name"])

    # 2. Lookup VWRA
    res = requests.post(f"{BASE_URL}/lookup-stock", json={"ticker": "VWRA"})
    assert res.status_code == 200
    vwra_info = res.json()
    print("VWRA Info:", vwra_info["name"])

    # 3. Create a portfolio and calculate
    portfolio = {
        "calendar_year": 2023,
        "stocks": [
            {
                "id": "stock_qcom",
                "ticker": "QCOM",
                "yahoo_ticker": qcom_info.get("yahoo_ticker", "QCOM"),
                "currency": qcom_info.get("currency", "USD"),
                "company_info": {
                    "country_code": "2",
                    "name": "Qualcomm",
                    "address": "San Diego",
                    "zip": "92121",
                    "nature": "Company"
                },
                "skip_dividends": False,
                "lots": [
                    {
                        "id": "lot_1",
                        "buy_date": "2021-08-20",
                        "quantity": 24,
                        "buy_price": 144.44,
                        "sells": [
                            {
                                "id": "sell_1",
                                "sell_date": "2023-05-10",
                                "quantity": 10,
                                "sell_price": 110.00
                            }
                        ]
                    }
                ]
            },
            {
                "id": "stock_vwra",
                "ticker": "VWRA",
                "yahoo_ticker": vwra_info.get("yahoo_ticker", "VWRA.L"),
                "currency": vwra_info.get("currency", "USD"),
                "company_info": {
                    "country_code": "44",
                    "name": "Vanguard FTSE All-World UCITS ETF",
                    "address": "Ireland",
                    "zip": "12345",
                    "nature": "ETF"
                },
                "skip_dividends": True,
                "lots": [
                    {
                        "id": "lot_2",
                        "buy_date": "2022-01-15",
                        "quantity": 50,
                        "buy_price": 115.00,
                        "sells": []
                    }
                ]
            }
        ],
        "overrides": {},
        "sbi_rate_overrides": {}
    }

    # First fetch SBI rates to ensure we have them
    res = requests.post(f"{BASE_URL}/fetch-sbi-rates", json={"currency": "USD"})
    assert res.status_code == 200

    # Calculate
    print("Calculating A3 rows...")
    res = requests.post(f"{BASE_URL}/calculate", json=portfolio)
    assert res.status_code == 200
    calc_data = res.json()
    assert calc_data["success"] is True
    
    rows = calc_data["rows"]
    print(f"Calculated {len(rows)} rows.")
    for r in rows:
        print(f"  {r['entity_name']} - Initial: {r['initial_value']}, Peak: {r['peak_value']}, Closing: {r['closing_balance']}")

    # 4. Save Portfolio
    print("Saving portfolio...")
    res = requests.post(f"{BASE_URL}/save", json=portfolio)
    assert res.status_code == 200
    
    # 5. Import previous year
    print("Testing year import flow...")
    res = requests.post(f"{BASE_URL}/import-previous-year", json={"target_year": 2024, "source_year": 2023})
    assert res.status_code == 200
    import_data = res.json()
    assert import_data["success"] is True
    imported_portfolio = import_data["portfolio"]
    
    # Verify sells were carried over correctly (quantity logic)
    qcom_imported = imported_portfolio["stocks"][0]
    # In original, 24 bought, 10 sold. Carry forward logic keeps the original lot but remaining qty is 14 during calculation
    print(f"Imported QCOM lots: {len(qcom_imported['lots'])}")

    # 6. Test Excel Export
    print("Testing Excel export...")
    res = requests.post(f"{BASE_URL}/export-excel", json={"rows": rows, "calendar_year": 2023})
    assert res.status_code == 200
    assert len(res.content) > 0
    with open("test_export.xlsx", "wb") as f:
        f.write(res.content)
    print("Excel exported to test_export.xlsx")

if __name__ == "__main__":
    try:
        test_qcom_vwra()
        print("✅ ALL TESTS PASSED!")
    except Exception as e:
        print(f"❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
