"""
G'ayrat Stroy House ERP System - Main Application

Qurilish mollari do'koni uchun ERP tizimi.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from database import init_db, db
from database.seed import seed_all
from core.config import settings
from routers import (
    auth_router, users_router, products_router,
    customers_router, warehouse_router, sales_router,
    reports_router, sms_router
)
from routers.settings import router as settings_router
from routers.sync import router as sync_router
from routers import printers
from routers.bot_api import router as bot_api_router
from routers.expenses import router as expenses_router
from routers.suppliers import router as suppliers_router


def ensure_missing_columns():
    """
    Agar migratsiya xato bilan o'tib ketgan bo'lsa,
    muhim ustunlarni qo'lda qo'shish.
    """
    from sqlalchemy import text, inspect

    with db.get_session() as session:
        inspector = inspect(session.bind)

        # sales jadvalidagi ustunlarni tekshirish
        sales_columns = [col['name'] for col in inspector.get_columns('sales')]

        missing_columns = []

        if 'contact_phone' not in sales_columns:
            session.execute(text(
                "ALTER TABLE sales ADD COLUMN contact_phone VARCHAR(20)"
            ))
            missing_columns.append('sales.contact_phone')

        if 'updated_by_id' not in sales_columns:
            session.execute(text(
                "ALTER TABLE sales ADD COLUMN updated_by_id INTEGER REFERENCES users(id)"
            ))
            missing_columns.append('sales.updated_by_id')

        if 'edit_reason' not in sales_columns:
            session.execute(text(
                "ALTER TABLE sales ADD COLUMN edit_reason TEXT"
            ))
            missing_columns.append('sales.edit_reason')

        # users jadvalidagi ustunlarni tekshirish
        users_columns = [col['name'] for col in inspector.get_columns('users')]

        if 'telegram_id' not in users_columns:
            session.execute(text(
                "ALTER TABLE users ADD COLUMN telegram_id VARCHAR(50)"
            ))
            missing_columns.append('users.telegram_id')

        if 'language' not in users_columns:
            session.execute(text(
                "ALTER TABLE users ADD COLUMN language VARCHAR(10) DEFAULT 'uz'"
            ))
            missing_columns.append('users.language')

        # products jadvalidagi ustunlarni tekshirish
        products_columns = [col['name'] for col in inspector.get_columns('products')]

        if 'default_per_piece' not in products_columns:
            session.execute(text(
                "ALTER TABLE products ADD COLUMN default_per_piece NUMERIC(20,4)"
            ))
            missing_columns.append('products.default_per_piece')

        if 'use_calculator' not in products_columns:
            session.execute(text(
                "ALTER TABLE products ADD COLUMN use_calculator BOOLEAN DEFAULT FALSE NOT NULL"
            ))
            missing_columns.append('products.use_calculator')

        # customers jadvalidagi ustunlarni tekshirish
        customers_columns = [col['name'] for col in inspector.get_columns('customers')]

        # customer_debts jadvalidagi ustunlarni tekshirish
        try:
            debts_columns = [col['name'] for col in inspector.get_columns('customer_debts')]
            if 'currency' not in debts_columns:
                session.execute(text(
                    "ALTER TABLE customer_debts ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'UZS'"
                ))
                session.execute(text(
                    "UPDATE customer_debts SET currency = 'USD' WHERE reference_type IN ('adjustment_usd')"
                ))
                missing_columns.append('customer_debts.currency')
        except Exception:
            pass

        if 'current_debt_usd' not in customers_columns:
            session.execute(text(
                "ALTER TABLE customers ADD COLUMN current_debt_usd NUMERIC(20,4) NOT NULL DEFAULT 0"
            ))
            missing_columns.append('customers.current_debt_usd')

        if 'category_id' not in customers_columns:
            session.execute(text(
                "CREATE TABLE IF NOT EXISTS customer_categories ("
                "id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, "
                "description TEXT, color VARCHAR(20) DEFAULT '#6366f1', "
                "is_active BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NOT NULL DEFAULT 0, "
                "created_at VARCHAR(50), updated_at VARCHAR(50), "
                "is_deleted BOOLEAN NOT NULL DEFAULT false, "
                "deleted_at VARCHAR(50), deleted_by_id INTEGER)"
            ))
            session.execute(text(
                "ALTER TABLE customers ADD COLUMN category_id INTEGER REFERENCES customer_categories(id)"
            ))
            missing_columns.append('customers.category_id')

        if missing_columns:
            logger.warning(f"⚠️  Qo'shilgan ustunlar: {', '.join(missing_columns)}")
        else:
            logger.info("✅ Barcha ustunlar mavjud")

        # Fix NULL values in customers financial fields
        null_fix_result = session.execute(text("""
            UPDATE customers SET
                credit_limit = COALESCE(credit_limit, 0),
                current_debt = COALESCE(current_debt, 0),
                advance_balance = COALESCE(advance_balance, 0),
                total_purchases = COALESCE(total_purchases, 0),
                total_purchases_count = COALESCE(total_purchases_count, 0),
                personal_discount_percent = COALESCE(personal_discount_percent, 0)
            WHERE credit_limit IS NULL
               OR current_debt IS NULL
               OR advance_balance IS NULL
               OR total_purchases IS NULL
               OR total_purchases_count IS NULL
               OR personal_discount_percent IS NULL
        """))
        if null_fix_result.rowcount > 0:
            logger.warning(f"⚠️  {null_fix_result.rowcount} ta mijozda NULL qiymatlar 0 ga tuzatildi")
        session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    logger.info("🚀 Starting G'ayrat Stroy House ERP API...")

    # Initialize database
    try:
        init_db()
        logger.info("✅ Database initialized")

        # Migratsiya o'tib ketgan bo'lsa, muhim ustunlarni qo'shish
        ensure_missing_columns()

        # Seed initial data
        with db.get_session() as session:
            seed_all(session)
        logger.info("✅ Database seeded")

    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        raise

    logger.info("✅ G'ayrat Stroy House ERP API started successfully!")

    yield

    # Shutdown
    logger.info("👋 Shutting down G'ayrat Stroy House ERP API...")


# Create FastAPI application
app = FastAPI(
    title="Vegas",
    description="""
    Qurilish mollari do'koni uchun ERP tizimi.
    
    ## Asosiy modullar:
    
    * **Auth** - Kirish, chiqish, token yangilash
    * **Users** - Foydalanuvchilar boshqaruvi
    * **Products** - Tovarlar, kategoriyalar, narxlar
    * **Warehouse** - Qoldiq, kirim-chiqim, inventarizatsiya
    * **Sales** - Sotuv, chegirmalar, qarzga sotish
    * **Customers** - Mijozlar, VIP, qarz hisobi
    * **Reports** - Hisobotlar, eksport
    """,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all unhandled exceptions."""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "detail": str(exc) if settings.debug else None
        }
    )


# Health check endpoint
@app.get("/", tags=["Health"])
async def root():
    """API root endpoint."""
    return {
        "message": "Vegas ERP API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for Docker/Kubernetes."""
    from sqlalchemy import text
    try:
        # Test database connection
        with db.get_session() as session:
            session.execute(text("SELECT 1"))

        return {
            "status": "healthy",
            "database": "connected"
        }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e)
            }
        )




# Include routers
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(users_router, prefix="/api/v1/users", tags=["Users"])
app.include_router(products_router, prefix="/api/v1/products", tags=["Products"])
app.include_router(customers_router, prefix="/api/v1/customers", tags=["Customers"])
app.include_router(warehouse_router, prefix="/api/v1/warehouse", tags=["Warehouse"])
app.include_router(sales_router, prefix="/api/v1/sales", tags=["Sales"])
app.include_router(reports_router, prefix="/api/v1/reports", tags=["Reports"])
app.include_router(sms_router, prefix="/api/v1/sms", tags=["SMS"])
app.include_router(settings_router, prefix="/api/v1/settings", tags=["Settings"])
app.include_router(sync_router, prefix="/api/v1/sync", tags=["Sync"])
app.include_router(printers.router, prefix="/api/v1/printers", tags=["Printers"])
app.include_router(expenses_router, prefix="/api/v1/expenses", tags=["Expenses"])
app.include_router(suppliers_router, prefix="/api/v1/suppliers", tags=["Suppliers"])

# Internal Bot API (no JWT auth - internal network only)
app.include_router(bot_api_router, prefix="/internal/bot", tags=["Bot Internal"])






if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug
    )