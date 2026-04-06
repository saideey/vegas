"""
Suppliers router - CRUD operations and debt/payment management.
All records use soft delete - nothing is permanently deleted.
"""

from typing import Optional
from decimal import Decimal
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel as PydanticBase, field_validator

from database import get_db
from database.models import User, PermissionType, Supplier, SupplierDebt
from database.base import get_tashkent_now
from core.dependencies import get_current_active_user, PermissionChecker

router = APIRouter()


# ==================== SCHEMAS ====================

class SupplierCreate(PydanticBase):
    name: str
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    phone_secondary: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    inn: Optional[str] = None
    bank_account: Optional[str] = None
    bank_name: Optional[str] = None
    mfo: Optional[str] = None
    notes: Optional[str] = None
    initial_debt: Optional[Decimal] = None  # Boshlang'ich qarz
    initial_debt_note: Optional[str] = None


class SupplierUpdate(PydanticBase):
    name: Optional[str] = None
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    phone_secondary: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    inn: Optional[str] = None
    bank_account: Optional[str] = None
    bank_name: Optional[str] = None
    mfo: Optional[str] = None
    notes: Optional[str] = None


class SupplierDebtAdd(PydanticBase):
    amount: Decimal
    description: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def validate_positive(cls, v):
        if v <= 0:
            raise ValueError("Summa 0 dan katta bo'lishi kerak")
        return v


class SupplierPaymentCreate(PydanticBase):
    amount: Decimal
    payment_type: str = "cash"
    description: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def validate_positive(cls, v):
        if v <= 0:
            raise ValueError("Summa 0 dan katta bo'lishi kerak")
        return v


# ==================== SUPPLIERS CRUD ====================

@router.get("/list/active", summary="Aktiv ta'minotchilar (select uchun)")
async def get_active_suppliers_list(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get simple list of active suppliers for dropdowns."""
    suppliers = db.query(Supplier).filter(
        Supplier.is_deleted == False,
        Supplier.is_active == True
    ).order_by(Supplier.name).all()

    return {
        "success": True,
        "data": [{
            "id": s.id,
            "name": s.name,
            "company_name": s.company_name,
            "phone": s.phone,
            "current_debt": float(s.current_debt or 0)
        } for s in suppliers]
    }


@router.get("", summary="Ta'minotchilar ro'yxati")
async def get_suppliers(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    q: Optional[str] = None,
    has_debt: Optional[bool] = None,
    is_active: bool = True,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get paginated suppliers list."""
    query = db.query(Supplier).filter(Supplier.is_deleted == False)

    if is_active is not None:
        query = query.filter(Supplier.is_active == is_active)

    if q:
        search = f"%{q}%"
        query = query.filter(
            (Supplier.name.ilike(search)) |
            (Supplier.company_name.ilike(search)) |
            (Supplier.phone.ilike(search)) |
            (Supplier.contact_person.ilike(search))
        )

    if has_debt:
        query = query.filter(Supplier.current_debt > 0)

    total = query.count()
    suppliers = query.order_by(Supplier.name)\
        .offset((page - 1) * per_page).limit(per_page).all()

    data = [{
        "id": s.id,
        "name": s.name,
        "company_name": s.company_name,
        "contact_person": s.contact_person,
        "phone": s.phone,
        "phone_secondary": s.phone_secondary,
        "email": s.email,
        "address": s.address,
        "city": s.city,
        "inn": s.inn,
        "bank_account": s.bank_account,
        "bank_name": s.bank_name,
        "mfo": s.mfo,
        "current_debt": float(s.current_debt or 0),
        "advance_balance": float(s.advance_balance or 0),
        "notes": s.notes,
        "is_active": s.is_active,
        "created_at": s.created_at.isoformat() if s.created_at else None
    } for s in suppliers]

    # Total debt summary
    total_debt = float(db.query(func.coalesce(func.sum(Supplier.current_debt), 0)).filter(
        Supplier.is_deleted == False
    ).scalar() or 0)

    return {
        "success": True,
        "data": data,
        "total": total,
        "total_debt": total_debt,
        "page": page,
        "per_page": per_page
    }


@router.get("/{supplier_id}", summary="Ta'minotchi ma'lumotlari")
async def get_supplier(
    supplier_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get supplier by ID with debt history."""
    supplier = db.query(Supplier).filter(
        Supplier.id == supplier_id, Supplier.is_deleted == False
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Ta'minotchi topilmadi")

    return {
        "success": True,
        "data": {
            "id": supplier.id,
            "name": supplier.name,
            "company_name": supplier.company_name,
            "contact_person": supplier.contact_person,
            "phone": supplier.phone,
            "phone_secondary": supplier.phone_secondary,
            "email": supplier.email,
            "address": supplier.address,
            "city": supplier.city,
            "inn": supplier.inn,
            "bank_account": supplier.bank_account,
            "bank_name": supplier.bank_name,
            "mfo": supplier.mfo,
            "current_debt": float(supplier.current_debt or 0),
            "advance_balance": float(supplier.advance_balance or 0),
            "notes": supplier.notes,
            "is_active": supplier.is_active,
            "created_at": supplier.created_at.isoformat() if supplier.created_at else None
        }
    }


@router.post("", summary="Ta'minotchi qo'shish")
async def create_supplier(
    data: SupplierCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create new supplier with optional initial debt."""
    supplier = Supplier(
        name=data.name,
        company_name=data.company_name,
        contact_person=data.contact_person,
        phone=data.phone,
        phone_secondary=data.phone_secondary,
        email=data.email,
        address=data.address,
        city=data.city,
        inn=data.inn,
        bank_account=data.bank_account,
        bank_name=data.bank_name,
        mfo=data.mfo,
        notes=data.notes,
        current_debt=Decimal("0"),
        advance_balance=Decimal("0"),
        is_active=True
    )
    db.add(supplier)
    db.flush()

    # Handle initial debt
    if data.initial_debt and data.initial_debt > 0:
        supplier.current_debt = data.initial_debt
        debt_record = SupplierDebt(
            supplier_id=supplier.id,
            transaction_type="DEBT_INCREASE",
            amount=data.initial_debt,
            balance_before=Decimal("0"),
            balance_after=data.initial_debt,
            reference_type="initial",
            description=data.initial_debt_note or "Boshlang'ich qarz",
            created_by_id=current_user.id
        )
        db.add(debt_record)

    db.commit()
    db.refresh(supplier)

    return {
        "success": True,
        "data": {"id": supplier.id, "name": supplier.name},
        "message": "Ta'minotchi yaratildi"
    }


@router.put("/{supplier_id}", summary="Ta'minotchi tahrirlash")
async def update_supplier(
    supplier_id: int,
    data: SupplierUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update supplier info. Old values are preserved in audit."""
    supplier = db.query(Supplier).filter(
        Supplier.id == supplier_id, Supplier.is_deleted == False
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Ta'minotchi topilmadi")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            setattr(supplier, key, value)

    db.commit()
    return {"success": True, "message": "Ta'minotchi yangilandi"}


@router.delete("/{supplier_id}", summary="Ta'minotchi o'chirish (soft)")
async def delete_supplier(
    supplier_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Soft delete supplier - marks as deleted, never removes."""
    supplier = db.query(Supplier).filter(
        Supplier.id == supplier_id, Supplier.is_deleted == False
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Ta'minotchi topilmadi")

    supplier.is_deleted = True
    supplier.is_active = False
    supplier.deleted_at = get_tashkent_now()
    db.commit()

    return {"success": True, "message": "Ta'minotchi o'chirildi (arxivlandi)"}


# ==================== DEBT MANAGEMENT ====================

@router.post("/{supplier_id}/add-debt", summary="Ta'minotchiga qarz qo'shish")
async def add_supplier_debt(
    supplier_id: int,
    data: SupplierDebtAdd,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Add debt to supplier (we owe them more)."""
    supplier = db.query(Supplier).filter(
        Supplier.id == supplier_id, Supplier.is_deleted == False
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Ta'minotchi topilmadi")

    if supplier.current_debt is None:
        supplier.current_debt = Decimal("0")

    balance_before = supplier.current_debt
    supplier.current_debt += data.amount

    debt_record = SupplierDebt(
        supplier_id=supplier_id,
        transaction_type="DEBT_INCREASE",
        amount=data.amount,
        balance_before=balance_before,
        balance_after=supplier.current_debt,
        reference_type="manual",
        description=data.description or "Qo'shimcha qarz qo'shildi",
        created_by_id=current_user.id
    )
    db.add(debt_record)
    db.commit()

    return {
        "success": True,
        "message": f"Qarz qo'shildi. Joriy qarz: {supplier.current_debt:,.0f} so'm",
        "current_debt": float(supplier.current_debt)
    }


@router.post("/{supplier_id}/pay-debt", summary="Ta'minotchiga to'lov")
async def pay_supplier_debt(
    supplier_id: int,
    data: SupplierPaymentCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Pay supplier debt."""
    supplier = db.query(Supplier).filter(
        Supplier.id == supplier_id, Supplier.is_deleted == False
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Ta'minotchi topilmadi")

    if supplier.current_debt is None:
        supplier.current_debt = Decimal("0")

    balance_before = supplier.current_debt
    supplier.current_debt -= data.amount
    if supplier.current_debt < 0:
        supplier.current_debt = Decimal("0")

    debt_record = SupplierDebt(
        supplier_id=supplier_id,
        transaction_type="DEBT_PAYMENT",
        amount=data.amount,
        balance_before=balance_before,
        balance_after=supplier.current_debt,
        payment_type=data.payment_type,
        reference_type="payment",
        description=data.description or f"To'lov ({data.payment_type})",
        created_by_id=current_user.id
    )
    db.add(debt_record)
    db.commit()

    return {
        "success": True,
        "message": f"To'lov qabul qilindi. Qolgan qarz: {supplier.current_debt:,.0f} so'm",
        "current_debt": float(supplier.current_debt)
    }


@router.get("/{supplier_id}/debt-history", summary="Ta'minotchi qarz tarixi")
async def get_supplier_debt_history(
    supplier_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get supplier debt transaction history. Includes soft-deleted records."""
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Ta'minotchi topilmadi")

    # Show ALL records including soft-deleted (full audit trail)
    query = db.query(SupplierDebt).filter(
        SupplierDebt.supplier_id == supplier_id
    ).order_by(SupplierDebt.created_at.desc())

    total = query.count()
    records = query.offset((page - 1) * per_page).limit(per_page).all()

    data = [{
        "id": r.id,
        "transaction_type": r.transaction_type,
        "amount": float(r.amount or 0),
        "balance_before": float(r.balance_before or 0),
        "balance_after": float(r.balance_after or 0),
        "payment_type": r.payment_type,
        "reference_type": r.reference_type,
        "description": r.description,
        "created_by_name": f"{r.created_by.first_name} {r.created_by.last_name}" if r.created_by else None,
        "is_deleted": r.is_deleted,
        "created_at": r.created_at.isoformat() if r.created_at else None
    } for r in records]

    return {
        "success": True,
        "data": data,
        "total": total,
        "current_debt": float(supplier.current_debt or 0)
    }
