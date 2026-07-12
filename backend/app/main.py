from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import calendar, dwd, health, parcels, shopping, todos, trains, weather

app = FastAPI(title="home_dashboard backend", version="0.1.0")

# Permissive CORS: backend only ever serves the dashboard frontend on the same LAN.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(trains.router, prefix="/api/trains")
app.include_router(weather.router, prefix="/api/weather")
app.include_router(shopping.router, prefix="/api/shopping")
app.include_router(calendar.router, prefix="/api/calendar")
app.include_router(todos.router, prefix="/api/todos")
app.include_router(parcels.router, prefix="/api/parcels")
app.include_router(dwd.router, prefix="/api/warnings")
