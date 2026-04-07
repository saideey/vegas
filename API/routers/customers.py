"""
Customers router - CRUD operations and debt management.
"""

from typing import Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text as _text

from database import get_db
from database.models import User, PermissionType
from core.dependencies import get_current_active_user, PermissionChecker
from schemas.customer import (
    CustomerCreate, CustomerUpdate, CustomerResponse, CustomerListResponse,
    CustomerSearchParams, CustomerDebtListResponse, CustomerPaymentRequest,
    CustomerAdvanceRequest, AddDebtRequest, VIPCredentialsCreate
)
from schemas.base import SuccessResponse, DeleteResponse
from services.customer import CustomerService
from services.telegram_notifier import send_payment_notification_sync
from utils.helpers import get_tashkent_now


router = APIRouter()


@router.get(
    "",
    response_model=CustomerListResponse,
    summary="Mijozlar ro'yxati"
)
async def get_customers(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    q: Optional[str] = None,
    customer_type: Optional[str] = None,
    has_debt: Optional[bool] = None,
    is_active: bool = True,
    manager_id: Optional[int] = None,
    sort_by: str = "name",
    sort_order: str = "asc",
    category_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get paginated customers list."""
    service = CustomerService(db)
    
    params = CustomerSearchParams(
        q=q,
        customer_type=customer_type,
        has_debt=has_debt,
        is_active=is_active,
        manager_id=manager_id,
        sort_by=sort_by,
        sort_order=sort_order,
        category_id=category_id
    )
    
    customers, total = service.get_customers(page, per_page, params)
    
    # Fetch current_debt_usd fresh from DB (bypass ORM cache)
    customer_ids = [c.id for c in customers]
    usd_debt_map = {}
    if customer_ids:
        # Build SQL with literal IDs (safe - IDs are integers)
        ids_str = ",".join(str(int(cid)) for cid in customer_ids)
        rows = db.execute(
            _text(f"SELECT id, COALESCE(current_debt_usd, 0) FROM customers WHERE id IN ({ids_str})")
        ).fetchall()
        usd_debt_map = {r[0]: float(r[1]) for r in rows}

    data = [{
        "id": c.id,
        "name": c.name,
        "company_name": c.company_name,
        "phone": c.phone,
        "phone_secondary": c.phone_secondary,
        "telegram_id": c.telegram_id,
        "email": c.email,
        "address": c.address,
        "customer_type": c.customer_type.name if c.customer_type else "REGULAR",
        "credit_limit": c.credit_limit or Decimal("0"),
        "current_debt": c.current_debt or Decimal("0"),
        "advance_balance": c.advance_balance or Decimal("0"),
        "total_purchases": c.total_purchases or Decimal("0"),
        "is_active": c.is_active,
        "manager_id": c.manager_id,
        "current_debt_usd": usd_debt_map.get(c.id, 0.0),
        "manager_name": c.manager.full_name if c.manager else None,
        "category_id": c.category_id,
        "category_name": c.category.name if c.category else None,
        "category_color": c.category.color if c.category else None,
    } for c in customers]
    
    return CustomerListResponse(
        data=data,
        total=total,
        page=page,
        per_page=per_page
    )


@router.get(
    "/debtors",
    summary="Qarzdorlar ro'yxati"
)
async def get_debtors(
    min_debt: Optional[Decimal] = None,
    seller_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all customers with debt. If seller_id is provided, returns only that seller's customers."""
    service = CustomerService(db)
    debtors = service.get_debtors(min_debt, manager_id=seller_id)
    total_debt = service.get_total_debt(manager_id=seller_id)
    
    data = [{
        "id": c.id,
        "name": c.name,
        "phone": c.phone,
        "company_name": c.company_name,
        "current_debt": c.current_debt or Decimal("0"),
        "credit_limit": c.credit_limit or Decimal("0"),
        "last_purchase_date": c.last_purchase_date.isoformat() if c.last_purchase_date else None
    } for c in debtors]

    # Fetch current_debt_usd fresh for debtors
    debtor_ids = [c.id for c in debtors]
    usd_map = {}
    if debtor_ids:
        ids_str_d = ",".join(str(int(cid)) for cid in debtor_ids)
        usd_rows = db.execute(
            _text(f"SELECT id, COALESCE(current_debt_usd,0) FROM customers WHERE id IN ({ids_str_d})")
        ).fetchall()
        usd_map = {r[0]: float(r[1]) for r in usd_rows}
    for item in data:
        item["current_debt_usd"] = usd_map.get(item["id"], 0.0)
    
    return {
        "success": True,
        "data": data,
        "total_debt": total_debt,
        "total_debt_usd": float(db.execute(
            _text("SELECT COALESCE(SUM(current_debt_usd),0) FROM customers WHERE is_deleted=false AND current_debt_usd > 0"),
        ).scalar() or 0),
        "debtors_count": len(debtors)
    }


# ═══════════════════════════════════════════════════════════════
# CUSTOMER CATEGORIES
# ═══════════════════════════════════════════════════════════════

from database.models import CustomerCategory


@router.get(
    "/categories",
    summary="Mijoz kategoriyalari ro'yxati"
)
async def get_customer_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Get all active customer categories."""
    cats = (
        db.query(CustomerCategory)
        .filter(CustomerCategory.is_deleted == False, CustomerCategory.is_active == True)
        .order_by(CustomerCategory.sort_order, CustomerCategory.name)
        .all()
    )
    return {
        "success": True,
        "data": [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "color": c.color,
                "sort_order": c.sort_order,
                "customer_count": c.customers.filter_by(is_deleted=False).count()
            }
            for c in cats
        ]
    }


@router.post(
    "/categories",
    summary="Yangi kategoriya yaratish",
    dependencies=[Depends(PermissionChecker([PermissionType.CUSTOMER_CREATE]))]
)
async def create_customer_category(
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Create a new customer category."""
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Kategoriya nomi bo'sh bo'lmasin")

    existing = db.query(CustomerCategory).filter(
        CustomerCategory.name == name,
        CustomerCategory.is_deleted == False
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Bu nomli kategoriya allaqachon mavjud")

    cat = CustomerCategory(
        name=name,
        description=data.get("description"),
        color=data.get("color", "#6366f1"),
        sort_order=data.get("sort_order", 0),
        is_active=True,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {
        "success": True,
        "data": {"id": cat.id, "name": cat.name, "color": cat.color, "description": cat.description, "sort_order": cat.sort_order}
    }


@router.put(
    "/categories/{category_id}",
    summary="Kategoriyani tahrirlash",
    dependencies=[Depends(PermissionChecker([PermissionType.CUSTOMER_CREATE]))]
)
async def update_customer_category(
    category_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    cat = db.query(CustomerCategory).filter(
        CustomerCategory.id == category_id,
        CustomerCategory.is_deleted == False
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Kategoriya topilmadi")

    if "name" in data and data["name"]:
        cat.name = data["name"].strip()
    if "description" in data:
        cat.description = data["description"]
    if "color" in data:
        cat.color = data["color"]
    if "sort_order" in data:
        cat.sort_order = data["sort_order"]
    if "is_active" in data:
        cat.is_active = data["is_active"]

    db.commit()
    db.refresh(cat)
    return {
        "success": True,
        "data": {"id": cat.id, "name": cat.name, "color": cat.color, "description": cat.description, "sort_order": cat.sort_order}
    }


@router.delete(
    "/categories/{category_id}",
    summary="Kategoriyani o'chirish",
    dependencies=[Depends(PermissionChecker([PermissionType.CUSTOMER_DELETE]))]
)
async def delete_customer_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    cat = db.query(CustomerCategory).filter(
        CustomerCategory.id == category_id,
        CustomerCategory.is_deleted == False
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Kategoriya topilmadi")

    # Unlink customers from this category
    from database.models import Customer as CustomerModel
    db.query(CustomerModel).filter(CustomerModel.category_id == category_id).update(
        {"category_id": None}
    )

    cat.is_deleted = True
    db.commit()
    return {"success": True, "message": "Kategoriya o'chirildi"}


@router.patch(
    "/{customer_id}/category",
    summary="Mijozga kategoriya biriktirish"
)
async def assign_customer_category(
    customer_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Assign or remove category from a customer."""
    service = CustomerService(db)
    customer = service.get_customer_by_id(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Mijoz topilmadi")

    category_id = data.get("category_id")  # None to remove

    if category_id is not None:
        cat = db.query(CustomerCategory).filter(
            CustomerCategory.id == category_id,
            CustomerCategory.is_deleted == False
        ).first()
        if not cat:
            raise HTTPException(status_code=404, detail="Kategoriya topilmadi")

    customer.category_id = category_id
    db.commit()
    return {"success": True, "message": "Kategoriya yangilandi"}



@router.get(
    "/usd-debts",
    summary="Mijozlar USD qarzlari (fresh)"
)
async def get_customers_usd_debts(
    ids: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Return {id: usd_debt} map for given customer IDs. Always reads fresh from DB."""
    try:
        id_list = [int(x.strip()) for x in ids.split(",") if x.strip().isdigit()]
    except Exception:
        return {}
    if not id_list:
        return {}
    ids_str = ",".join(str(i) for i in id_list)
    rows = db.execute(
        _text(f"SELECT id, COALESCE(current_debt_usd, 0) FROM customers WHERE id IN ({ids_str})")
    ).fetchall()
    return {r[0]: float(r[1]) for r in rows}

@router.get(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Mijoz ma'lumotlari"
)
async def get_customer(
    customer_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get customer by ID."""
    service = CustomerService(db)
    customer = service.get_customer_by_id(customer_id)
    
    if not customer:
        raise HTTPException(status_code=404, detail="Mijoz topilmadi")
    
    result = CustomerResponse.model_validate(customer)
    # Override current_debt_usd with fresh raw SQL value
    usd_val = db.execute(
        _text("SELECT COALESCE(current_debt_usd,0) FROM customers WHERE id=:id"),
        {"id": customer_id}
    ).scalar()
    result.current_debt_usd = float(usd_val or 0)
    return result


@router.post(
    "",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Mijoz yaratish",
    dependencies=[Depends(PermissionChecker([PermissionType.CUSTOMER_CREATE]))]
)
async def create_customer(
    data: CustomerCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create new customer."""
    service = CustomerService(db)
    customer, message = service.create_customer(data, current_user.id)
    
    if not customer:
        raise HTTPException(status_code=400, detail=message)
    
    return CustomerResponse.model_validate(customer)


@router.patch(
    "/{customer_id}",
    response_model=CustomerResponse,
    summary="Mijozni yangilash",
    dependencies=[Depends(PermissionChecker([PermissionType.CUSTOMER_EDIT]))]
)
async def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update customer."""
    service = CustomerService(db)
    customer, message = service.update_customer(customer_id, data, current_user.id)
    
    if not customer:
        raise HTTPException(status_code=400, detail=message)
    
    return CustomerResponse.model_validate(customer)


@router.delete(
    "/{customer_id}",
    response_model=DeleteResponse,
    summary="Mijozni o'chirish",
    dependencies=[Depends(PermissionChecker([PermissionType.CUSTOMER_DELETE]))]
)
async def delete_customer(
    customer_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete customer."""
    service = CustomerService(db)
    success, message = service.delete_customer(customer_id, current_user.id)
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return DeleteResponse(id=customer_id, message=message)


# ==================== DEBT MANAGEMENT ====================

@router.get(
    "/{customer_id}/payments",
    summary="Mijoz to'lovlari tarixi"
)
async def get_customer_payments(
    customer_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get customer payment history."""
    service = CustomerService(db)
    
    customer = service.get_customer_by_id(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Mijoz topilmadi")
    
    # Get debt records that are PAYMENT type
    records, total = service.get_debt_history(customer_id, page, per_page)
    
    # Filter only payment records
    payments = [r for r in records if r.transaction_type in ['PAYMENT', 'payment', 'DEBT_PAYMENT']]
    
    data = [{
        "id": r.id,
        "transaction_type": r.transaction_type,
        "amount": abs(r.amount),
        "payment_type": r.reference_type.upper() if r.reference_type else "CASH",
        "description": r.description,
        "created_at": r.created_at.isoformat()
    } for r in payments]
    
    return {
        "success": True,
        "data": data,
        "total": len(payments)
    }


@router.get(
    "/{customer_id}/debt-history",
    summary="Mijoz qarz tarixi"
)
async def get_customer_debt_history(
    customer_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get customer debt transaction history."""
    service = CustomerService(db)
    
    customer = service.get_customer_by_id(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Mijoz topilmadi")
    
    records, total = service.get_debt_history(customer_id, page, per_page)
    
    data = [{
        "id": r.id,
        "transaction_type": r.transaction_type,
        "amount": r.amount,
        "balance_before": r.balance_before,
        "balance_after": r.balance_after,
        "reference_type": r.reference_type,
        "reference_id": r.reference_id,
        "description": r.description,
        "currency": getattr(r, 'currency', 'UZS') or 'UZS',
        "created_by_name": f"{r.created_by.first_name} {r.created_by.last_name}" if r.created_by else None,
        "created_at": r.created_at.isoformat()
    } for r in records]
    
    return {
        "success": True,
        "data": data,
        "total": total,
        "current_debt": customer.current_debt,
        "current_debt_usd": float(db.execute(
            _text("SELECT COALESCE(current_debt_usd,0) FROM customers WHERE id=:id"),
            {"id": customer_id}
        ).scalar() or 0),
        "advance_balance": customer.advance_balance
    }


@router.post(
    "/{customer_id}/pay-debt",
    summary="Qarz to'lash",
    dependencies=[Depends(PermissionChecker([PermissionType.PAYMENT_CREATE]))]
)
async def pay_customer_debt(
    customer_id: int,
    data: CustomerPaymentRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Record debt payment from customer."""
    service = CustomerService(db)
    
    # Get customer before payment
    customer_before = service.get_customer_by_id(customer_id)
    if not customer_before:
        raise HTTPException(status_code=404, detail="Mijoz topilmadi")
    
    previous_debt = float(customer_before.current_debt) if customer_before else 0
    
    # Use unified payment method supporting all 4 scenarios
    from decimal import Decimal as _Dec
    success, message, change = service.pay_debt_unified(
        customer_id=customer_id,
        amount=data.amount,
        currency=getattr(data, 'currency', 'UZS'),
        target_debt=getattr(data, 'target_debt', 'UZS'),
        exchange_rate=getattr(data, 'exchange_rate', None),
        payment_type=data.payment_type,
        description=data.description,
        created_by_id=current_user.id
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    customer = service.get_customer_by_id(customer_id)
    
    # Send Telegram notification for debt payment
    try:
        operator_name = f"{current_user.first_name} {current_user.last_name}"
        
        send_payment_notification_sync(
            customer_telegram_id=customer.telegram_id if customer else None,
            customer_name=customer.name if customer else "Noma'lum",
            customer_phone=customer.phone if customer else "",
            customer_type=customer.customer_type.name if customer else "STANDARD",
            payment_date=get_tashkent_now(),
            payment_amount=float(data.amount),
            payment_type=data.payment_type.value if hasattr(data.payment_type, 'value') else str(data.payment_type),
            previous_debt=previous_debt,
            current_debt=float(customer.current_debt),
            operator_name=operator_name
        )
    except Exception as e:
        import logging
        logging.error(f"Failed to send payment notification: {e}")
    
    return {
        "success": True,
        "message": message,
        "change_amount": change,
        "current_debt": customer.current_debt,
        "current_debt_usd": float(db.execute(
            _text("SELECT COALESCE(current_debt_usd,0) FROM customers WHERE id=:id"),
            {"id": customer_id}
        ).scalar() or 0),
        "advance_balance": customer.advance_balance
    }


@router.post(
    "/{customer_id}/add-advance",
    summary="Avans qo'shish",
    dependencies=[Depends(PermissionChecker([PermissionType.PAYMENT_CREATE]))]
)
async def add_customer_advance(
    customer_id: int,
    data: CustomerAdvanceRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Add advance payment from customer."""
    service = CustomerService(db)
    
    success, message = service.add_advance(
        customer_id,
        data.amount,
        data.payment_type,
        data.description,
        current_user.id
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    customer = service.get_customer_by_id(customer_id)
    
    return {
        "success": True,
        "message": message,
        "advance_balance": customer.advance_balance
    }


# ==================== MANUAL DEBT MANAGEMENT ====================

@router.post(
    "/{customer_id}/add-debt",
    summary="Qo'shimcha qarz qo'shish",
    dependencies=[Depends(PermissionChecker([PermissionType.SALE_DEBT]))]
)
async def add_manual_debt(
    customer_id: int,
    data: AddDebtRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Manually add debt to customer (UZS or USD)."""
    service = CustomerService(db)

    customer = service.get_customer_by_id(customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Mijoz topilmadi")

    currency = getattr(data, 'currency', 'UZS').upper()

    if currency == 'USD':
        success, message = service.add_debt_usd(
            customer_id=customer_id,
            amount_usd=data.amount,
            description=data.description or "Dollar qarz qo'shildi",
            created_by_id=current_user.id
        )
    else:
        success, message = service.add_debt(
            customer_id=customer_id,
            amount=data.amount,
            reference_type="manual_adjustment",
            description=data.description or "So'm qarz qo'shildi",
            created_by_id=current_user.id
        )

    if not success:
        raise HTTPException(status_code=400, detail=message)

    db.refresh(customer)
    return {
        "success": True,
        "message": message,
        "current_debt": customer.current_debt,
        "current_debt_usd": float(db.execute(
            _text("SELECT COALESCE(current_debt_usd,0) FROM customers WHERE id=:id"),
            {"id": customer_id}
        ).scalar() or 0)
    }


# ==================== VIP MANAGEMENT ====================

@router.post(
    "/{customer_id}/set-vip",
    summary="VIP hisob yaratish",
    dependencies=[Depends(PermissionChecker([PermissionType.CUSTOMER_EDIT]))]
)
async def set_vip_credentials(
    customer_id: int,
    data: VIPCredentialsCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Set VIP credentials for customer (login/password for personal cabinet)."""
    service = CustomerService(db)
    
    success, message = service.set_vip_credentials(
        customer_id,
        data.login,
        data.password,
        current_user.id
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return SuccessResponse(message=message)

