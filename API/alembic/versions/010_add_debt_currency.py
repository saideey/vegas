"""Add currency field to customer_debts

Revision ID: 010_add_debt_currency
Revises: 009_add_customer_debt_usd
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa

revision = '010_add_debt_currency'
down_revision = '009_add_customer_debt_usd'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('customer_debts',
        sa.Column('currency', sa.String(3), nullable=False, server_default='UZS')
    )
    # Mark existing USD records
    op.execute(
        "UPDATE customer_debts SET currency = 'USD' WHERE reference_type IN ('adjustment_usd')"
    )

def downgrade():
    op.drop_column('customer_debts', 'currency')
