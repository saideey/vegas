"""Add customer USD debt tracking

Revision ID: 009_add_customer_debt_usd
Revises: 008_add_customer_category
Create Date: 2026-04-07
"""
from alembic import op
import sqlalchemy as sa

revision = '009_add_customer_debt_usd'
down_revision = '008_add_customer_category'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('customers',
        sa.Column('current_debt_usd', sa.Numeric(20, 4), nullable=False, server_default='0')
    )

def downgrade():
    op.drop_column('customers', 'current_debt_usd')
