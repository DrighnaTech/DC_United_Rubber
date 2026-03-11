import os
import warnings
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.modules.data_extract_route import router as data_extract_route
from app.modules.urdb_route import router as urdb_router

# Initialize FastAPI app
app = FastAPI(docs_url="/")

origins = ["*"]

warnings.filterwarnings("ignore")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure directory exists
directory_list = ["uploads", "json_data", "csv_exports", "excel_exports"]
for directory in directory_list:
    dir_path = os.path.join(os.getcwd(), directory)
    os.makedirs(dir_path, exist_ok=True)

# Include routers
app.include_router(data_extract_route)
app.include_router(urdb_router)

if __name__ == '__main__':
    uvicorn.run("main:app", host = '0.0.0.0', port = 6060, log_level = "info", reload = True)
    print("running")