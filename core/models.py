from typing import List, Optional, Dict
from pydantic import BaseModel, Field, ConfigDict

class Sell(BaseModel):
    model_config = ConfigDict(extra="allow")
    
    id: str
    sell_date: str
    quantity: float
    sell_price: float

class Lot(BaseModel):
    model_config = ConfigDict(extra="allow")
    
    id: str
    buy_date: str
    quantity: float
    buy_price: float
    sells: List[Sell] = Field(default_factory=list)

class CompanyInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
    
    country_code: Optional[str] = None
    name: Optional[str] = None
    address: Optional[str] = None
    zip: Optional[str] = None
    nature: Optional[str] = None
    country: Optional[str] = None
    display_name: Optional[str] = None

class Dividend(BaseModel):
    model_config = ConfigDict(extra="allow")
    
    id: Optional[str] = None
    ex_date: str
    amount: float

class Stock(BaseModel):
    model_config = ConfigDict(extra="allow")
    
    id: str
    ticker: str
    yahoo_ticker: str
    currency: str = "USD"
    skip_dividends: bool = False
    company_info: Optional[CompanyInfo] = None
    lots: List[Lot] = Field(default_factory=list)
    dividends: Optional[List[Dividend]] = None  # Often runtime-only

class Portfolio(BaseModel):
    model_config = ConfigDict(extra="allow")
    
    calendar_year: int
    stocks: List[Stock] = Field(default_factory=list)
    overrides: Dict[str, Dict[str, Optional[float]]] = Field(default_factory=dict)
    sbi_rate_overrides: Dict[str, float] = Field(default_factory=dict)
