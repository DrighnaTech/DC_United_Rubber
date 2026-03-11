from pydantic import BaseModel
from typing import Union, Optional


class ResponseSchema(BaseModel):
    status: bool = True
    response: str
    data: Union[dict, list, None] = None
