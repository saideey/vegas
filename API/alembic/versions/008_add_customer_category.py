"""Add customer categories

Revision ID: 008_add_customer_category
Revises: 007_add_default_per_piece
Create Date: 2026-04-06

"""
from alembic import op
import sqlalchemy as sa

revision = '008_add_customer_category'
down_revision = '007_add_default_per_piece'
branch_labels = None
depends_on = None


def upgrade():
    # Create customer_categories table
    op.create_table(
        'customer_categories',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('color', sa.String(20), nullable=True, server_default='#6366f1'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.String(50), nullable=True),
        sa.Column('updated_at', sa.String(50), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.String(50), nullable=True),
        sa.Column('deleted_by_id', sa.Integer(), nullable=True),
    )
    op.create_index('ix_customer_categories_is_active', 'customer_categories', ['is_active'])

    # Add category_id to customers
    op.add_column('customers',
        sa.Column('category_id', sa.Integer(),
                  sa.ForeignKey('customer_categories.id'), nullable=True)
    )
    op.create_index('ix_customers_category_id', 'customers', ['category_id'])


def downgrade():
    op.drop_index('ix_customers_category_id', 'customers')
    op.drop_column('customers', 'category_id')
    op.drop_index('ix_customer_categories_is_active', 'customer_categories')
    op.drop_table('customer_categories')
