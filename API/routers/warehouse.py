"""
Warehouse router - Stock management, movements, and transfers.
"""

from typing import Optional
from decimal import Decimal
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from database import get_db
from database.models import User, PermissionType, MovementType
from core.dependencies import get_current_active_user, PermissionChecker
from schemas.warehouse import (
    WarehouseCreate, WarehouseUpdate, WarehouseResponse, WarehouseListResponse,
    StockResponse, StockListResponse, StockMovementCreate, StockMovementResponse,
    StockIncomeCreate, StockTransferCreate, StockTransferResponse
)
from schemas.base import SuccessResponse, DeleteResponse
from services.warehouse import WarehouseService, StockService, StockTransferService
from utils.helpers import get_tashkent_now


router = APIRouter()


# ==================== WAREHOUSES ====================

@router.get(
    "",
    response_model=WarehouseListResponse,
    summary="Omborlar ro'yxati"
)
async def get_warehouses(
    include_inactive: bool = False,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all warehouses."""
    service = WarehouseService(db)
    warehouses = service.get_warehouses(include_inactive)

    stock_service = StockService(db)

    data = []
    for w in warehouses:
        value = stock_service.get_stock_value(w.id)
        data.append({
            "id": w.id,
            "name": w.name,
            "code": w.code,
            "address": w.address,
            "phone": w.phone,
            "is_main": w.is_main,
            "is_active": w.is_active,
            "manager_id": w.manager_id,
            "total_value": value,
            "created_at": w.created_at,
            "updated_at": w.updated_at
        })

    return WarehouseListResponse(data=data, count=len(data))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Ombor yaratish",
    dependencies=[Depends(PermissionChecker([PermissionType.WAREHOUSE_CREATE]))]
)
async def create_warehouse(
    data: WarehouseCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create new warehouse."""
    service = WarehouseService(db)
    warehouse, message = service.create_warehouse(
        name=data.name,
        code=data.code,
        address=data.address,
        created_by_id=current_user.id
    )

    if not warehouse:
        raise HTTPException(status_code=400, detail=message)

    return {"success": True, "data": {"id": warehouse.id, "name": warehouse.name}, "message": message}


# ==================== STOCK ====================

@router.get(
    "/stock",
    summary="Qoldiqlar ro'yxati"
)
async def get_stock(
    warehouse_id: Optional[int] = None,
    category_id: Optional[int] = None,
    below_minimum: Optional[bool] = None,
    out_of_stock: Optional[bool] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get stock list with filters."""
    service = StockService(db)
    stocks, total = service.get_all_stock(
        warehouse_id=warehouse_id,
        category_id=category_id,
        below_minimum=below_minimum,
        out_of_stock=out_of_stock,
        search=search,
        page=page,
        per_page=per_page
    )

    total_value = service.get_stock_value(warehouse_id)

    data = [{
        "id": s.id,
        "product_id": s.product_id,
        "product_name": s.product.name,
        "product_article": s.product.article,
        "warehouse_id": s.warehouse_id,
        "warehouse_name": s.warehouse.name,
        "quantity": s.quantity,
        "base_uom_symbol": s.product.base_uom.symbol,
        "reserved_quantity": s.reserved_quantity,
        "available_quantity": s.quantity - s.reserved_quantity,
        "average_cost": s.average_cost,
        "total_value": s.quantity * s.average_cost,
        "min_stock_level": s.product.min_stock_level,
        "is_below_minimum": s.quantity < s.product.min_stock_level
    } for s in stocks]

    return {
        "success": True,
        "data": data,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_value": total_value
    }


@router.get(
    "/stock/low",
    summary="Kam qoldiqli tovarlar"
)
async def get_low_stock(
    warehouse_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get products below minimum stock level."""
    service = StockService(db)
    low_stock = service.get_low_stock_products(warehouse_id)

    return {
        "success": True,
        "data": low_stock,
        "count": len(low_stock)
    }


@router.get(
    "/stock/value",
    summary="Ombor qiymati"
)
async def get_stock_value(
    warehouse_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get total stock value."""
    service = StockService(db)
    value = service.get_stock_value(warehouse_id)

    return {
        "success": True,
        "total_value": value,
        "warehouse_id": warehouse_id
    }


# ==================== STOCK MOVEMENTS ====================

@router.get(
    "/movements",
    summary="Harakat tarixi"
)
async def get_movements(
    product_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get stock movements history."""
    service = StockService(db)
    movements, total = service.get_movements(
        product_id=product_id,
        warehouse_id=warehouse_id,
        movement_type=movement_type,
        start_date=start_date,
        end_date=end_date,
        search=q,
        page=page,
        per_page=per_page
    )

    data = [{
        "id": m.id,
        "product_id": m.product_id,
        "product_name": m.product.name,
        "product_article": m.product.article,
        "warehouse_id": m.warehouse_id,
        "warehouse_name": m.warehouse.name,
        "movement_type": m.movement_type.value,
        "quantity": m.quantity,
        "uom_symbol": m.uom.symbol,
        "base_quantity": m.base_quantity,
        "unit_price": m.unit_cost,  # UZS price
        "unit_price_usd": getattr(m, 'unit_price_usd', None),  # USD price
        "exchange_rate": getattr(m, 'exchange_rate', None),  # Exchange rate at time
        "total_price": m.total_cost,
        "stock_before": m.stock_before,
        "stock_after": m.stock_after,
        "reference_type": m.reference_type,
        "reference_id": m.reference_id,
        "document_number": m.document_number,
        "supplier_name": getattr(m, 'supplier_name', None),
        "notes": m.notes,
        "created_at": m.created_at.isoformat(),
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
        "created_by_name": m.created_by.first_name + " " + m.created_by.last_name if m.created_by else None,
        "updated_by_name": m.updated_by.first_name + " " + m.updated_by.last_name if getattr(m, 'updated_by', None) else None
    } for m in movements]

    return {
        "success": True,
        "data": data,
        "total": total,
        "page": page,
        "per_page": per_page
    }


@router.post(
    "/income",
    summary="Tovar kirim qilish",
    dependencies=[Depends(PermissionChecker([PermissionType.STOCK_INCOME]))]
)
async def stock_income(
    data: StockIncomeCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Record stock income (purchase/arrival) with optional landed costs."""
    service = StockService(db)
    from decimal import Decimal as Dec, ROUND_HALF_UP

    # ===== LANDED COST TAQSIMLASH =====
    # Har bir tovar uchun qo'shimcha xarajatni hisoblash
    item_extra_costs = {}  # {index: extra_cost_per_unit}

    if data.landed_costs:
        # Har bir tovarning umumiy summasi va miqdorini hisoblash
        item_totals = []
        total_value = Dec("0")
        total_qty = Dec("0")

        for i, item in enumerate(data.items):
            item_value = item.unit_price * item.quantity
            item_totals.append({
                "index": i,
                "value": item_value,
                "quantity": item.quantity
            })
            total_value += item_value
            total_qty += item.quantity

        # Har bir landed cost turini taqsimlash
        for lc in data.landed_costs:
            lc_amount = lc.amount

            for it in item_totals:
                idx = it["index"]
                if idx not in item_extra_costs:
                    item_extra_costs[idx] = Dec("0")

                if lc.allocation_method == "by_value" and total_value > 0:
                    # Summaga proporsional
                    share = it["value"] / total_value
                    item_extra_costs[idx] += (lc_amount * share / it["quantity"]).quantize(Dec("0.0001"), ROUND_HALF_UP)

                elif lc.allocation_method == "by_weight" and total_qty > 0:
                    # Miqdorga (vazniga) proporsional
                    share = it["quantity"] / total_qty
                    item_extra_costs[idx] += (lc_amount * share / it["quantity"]).quantize(Dec("0.0001"), ROUND_HALF_UP)

                elif lc.allocation_method == "equal" and len(item_totals) > 0:
                    # Teng taqsimlash
                    per_item_total = lc_amount / Dec(str(len(item_totals)))
                    item_extra_costs[idx] += (per_item_total / it["quantity"]).quantize(Dec("0.0001"), ROUND_HALF_UP)

                else:
                    # Default: summaga proporsional
                    if total_value > 0:
                        share = it["value"] / total_value
                        item_extra_costs[idx] += (lc_amount * share / it["quantity"]).quantize(Dec("0.0001"), ROUND_HALF_UP)

    # ===== TOVARLARNI KIRIM QILISH =====
    results = []
    landed_cost_details = []

    for i, item in enumerate(data.items):
        extra_cost = item_extra_costs.get(i, Dec("0"))
        final_unit_cost = item.unit_price + extra_cost  # Asl narx + xarajat

        stock, movement = service.add_stock(
            product_id=item.product_id,
            warehouse_id=data.warehouse_id,
            quantity=item.quantity,
            uom_id=item.uom_id,
            unit_cost=final_unit_cost,
            movement_type=MovementType.PURCHASE,
            reference_type="manual_income",
            document_number=data.document_number,
            notes=data.notes,
            created_by_id=current_user.id,
            unit_price_usd=item.unit_price_usd,
            exchange_rate=item.exchange_rate or data.exchange_rate,
            supplier_name=data.supplier_name
        )
        results.append({
            "product_id": item.product_id,
            "new_quantity": stock.quantity,
            "movement_id": movement.id,
            "original_cost": float(item.unit_price),
            "landed_extra": float(extra_cost),
            "final_cost": float(final_unit_cost)
        })

    # Landed costs summary for response
    if data.landed_costs:
        for lc in data.landed_costs:
            landed_cost_details.append({
                "type": lc.cost_type,
                "description": lc.description,
                "amount": float(lc.amount),
                "method": lc.allocation_method
            })

    # ===== TA'MINOTCHI QARZ HISOBLASH =====
    def _fmt(val):
        return f"{float(val):,.0f}"

    supplier_debt_info = None
    if data.supplier_id:
        from database.models import Supplier, SupplierDebt
        supplier = db.query(Supplier).filter(Supplier.id == data.supplier_id).first()
        if supplier:
            # Tovarlar umumiy summasi
            total_goods_cost = sum(r["final_cost"] * float(data.items[i].quantity) 
                                   for i, r in enumerate(results))
            # Landed costs summasi
            total_landed = sum(float(lc.amount) for lc in (data.landed_costs or []))
            grand_total = total_goods_cost + total_landed

            paid = float(data.paid_amount or 0)
            debt_for_supplier = grand_total - paid

            if supplier.current_debt is None:
                supplier.current_debt = Dec("0")

            # To'lov bo'lsa — yozish
            if paid > 0:
                balance_before = supplier.current_debt
                debt_record = SupplierDebt(
                    supplier_id=supplier.id,
                    transaction_type="DEBT_PAYMENT",
                    amount=Dec(str(paid)),
                    balance_before=balance_before,
                    balance_after=balance_before,
                    payment_type=data.payment_type or "cash",
                    reference_type="stock_income",
                    description=data.payment_note or f"Kirim #{data.document_number or ''} uchun to'lov",
                    created_by_id=current_user.id
                )
                db.add(debt_record)

            # Qarz bo'lsa — yozish
            if debt_for_supplier > 0:
                balance_before = supplier.current_debt
                supplier.current_debt += Dec(str(debt_for_supplier))

                debt_record = SupplierDebt(
                    supplier_id=supplier.id,
                    transaction_type="DEBT_INCREASE",
                    amount=Dec(str(debt_for_supplier)),
                    balance_before=balance_before,
                    balance_after=supplier.current_debt,
                    reference_type="stock_income",
                    description=f"Kirim #{data.document_number or ''}: tovar {_fmt(grand_total)}, to'landi {_fmt(paid)}, qarz {_fmt(debt_for_supplier)}",
                    created_by_id=current_user.id
                )
                db.add(debt_record)

            db.commit()
            supplier_debt_info = {
                "supplier_name": supplier.name,
                "total_amount": grand_total,
                "paid_amount": paid,
                "debt_amount": debt_for_supplier,
                "current_debt": float(supplier.current_debt)
            }

    return {
        "success": True,
        "message": f"{len(results)} ta tovar kirim qilindi",
        "data": results,
        "landed_costs": landed_cost_details,
        "supplier_debt": supplier_debt_info
    }


@router.post(
    "/adjustment",
    summary="Qoldiq tuzatish",
    dependencies=[Depends(PermissionChecker([PermissionType.STOCK_ADJUSTMENT]))]
)
async def stock_adjustment(
    data: StockMovementCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create stock adjustment (manual correction)."""
    service = StockService(db)

    movement_type = MovementType(data.movement_type)

    if movement_type in [MovementType.ADJUSTMENT_PLUS]:
        # Adding stock
        stock, movement = service.add_stock(
            product_id=data.product_id,
            warehouse_id=data.warehouse_id,
            quantity=data.quantity,
            uom_id=data.uom_id,
            unit_cost=data.unit_cost or Decimal("0"),
            movement_type=movement_type,
            document_number=data.document_number,
            notes=data.notes,
            created_by_id=current_user.id
        )
    else:
        # Removing stock
        stock, movement, msg = service.remove_stock(
            product_id=data.product_id,
            warehouse_id=data.warehouse_id,
            quantity=data.quantity,
            uom_id=data.uom_id,
            movement_type=movement_type,
            document_number=data.document_number,
            notes=data.notes,
            created_by_id=current_user.id
        )
        if not stock:
            raise HTTPException(status_code=400, detail=msg)

    return {
        "success": True,
        "message": "Qoldiq tuzatildi",
        "data": {
            "product_id": data.product_id,
            "new_quantity": stock.quantity,
            "movement_id": movement.id
        }
    }


# ==================== TRANSFERS ====================

@router.post(
    "/transfer",
    summary="Omborlar o'rtasida transfer",
    dependencies=[Depends(PermissionChecker([PermissionType.STOCK_TRANSFER]))]
)
async def create_transfer(
    data: StockTransferCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create stock transfer between warehouses."""
    service = StockTransferService(db)

    items = [item.model_dump() for item in data.items]

    transfer, message = service.create_transfer(
        from_warehouse_id=data.from_warehouse_id,
        to_warehouse_id=data.to_warehouse_id,
        items=items,
        notes=data.notes,
        created_by_id=current_user.id
    )

    if not transfer:
        raise HTTPException(status_code=400, detail=message)

    return {
        "success": True,
        "message": message,
        "data": {
            "id": transfer.id,
            "transfer_number": transfer.transfer_number,
            "status": transfer.status
        }
    }


@router.post(
    "/transfer/{transfer_id}/complete",
    summary="Transferni yakunlash",
    dependencies=[Depends(PermissionChecker([PermissionType.STOCK_TRANSFER]))]
)
async def complete_transfer(
    transfer_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Complete pending transfer."""
    service = StockTransferService(db)
    success, message = service.complete_transfer(transfer_id, current_user.id)

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return SuccessResponse(message=message)


@router.post(
    "/transfer/{transfer_id}/cancel",
    summary="Transferni bekor qilish",
    dependencies=[Depends(PermissionChecker([PermissionType.STOCK_TRANSFER]))]
)
async def cancel_transfer(
    transfer_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Cancel pending transfer."""
    service = StockTransferService(db)
    success, message = service.cancel_transfer(transfer_id, current_user.id)

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return SuccessResponse(message=message)


# ==================== STOCK MOVEMENT EDIT/DELETE (DIRECTOR ONLY) ====================

@router.get(
    "/movements/{movement_id}",
    summary="Bitta harakatni olish"
)
async def get_movement(
    movement_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get single stock movement by ID."""
    from database.models import StockMovement

    movement = db.query(StockMovement).filter(
        StockMovement.id == movement_id,
        StockMovement.is_deleted == False
    ).first()

    if not movement:
        raise HTTPException(status_code=404, detail="Harakat topilmadi")

    return {
        "success": True,
        "data": {
            "id": movement.id,
            "product_id": movement.product_id,
            "product_name": movement.product.name,
            "warehouse_id": movement.warehouse_id,
            "warehouse_name": movement.warehouse.name,
            "movement_type": movement.movement_type.value,
            "quantity": float(movement.quantity),
            "uom_id": movement.uom_id,
            "uom_symbol": movement.uom.symbol,
            "unit_price": float(movement.unit_cost or 0),
            "unit_price_usd": float(movement.unit_price_usd) if movement.unit_price_usd else None,
            "exchange_rate": float(movement.exchange_rate) if movement.exchange_rate else None,
            "total_price": float(movement.total_cost or 0),
            "document_number": movement.document_number,
            "supplier_name": movement.supplier_name,
            "notes": movement.notes,
            "created_at": movement.created_at.isoformat(),
            "updated_at": movement.updated_at.isoformat() if movement.updated_at else None,
            "created_by_name": f"{movement.created_by.first_name} {movement.created_by.last_name}" if movement.created_by else None,
            "updated_by_name": f"{movement.updated_by.first_name} {movement.updated_by.last_name}" if movement.updated_by else None
        }
    }


@router.put(
    "/movements/{movement_id}",
    summary="Harakatni tahrirlash (faqat Director)",
    dependencies=[Depends(PermissionChecker([PermissionType.DIRECTOR_OVERRIDE]))]
)
async def update_movement(
    movement_id: int,
    quantity: Optional[Decimal] = None,
    uom_id: Optional[int] = None,
    unit_price: Optional[Decimal] = None,
    unit_price_usd: Optional[Decimal] = None,
    exchange_rate: Optional[Decimal] = None,
    document_number: Optional[str] = None,
    supplier_name: Optional[str] = None,
    notes: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Edit stock movement. Only Director can do this.
    This will also update the stock quantity accordingly.
    """
    from database.models import StockMovement, Stock, ProductUOMConversion, UnitOfMeasure
    from datetime import datetime

    movement = db.query(StockMovement).filter(
        StockMovement.id == movement_id,
        StockMovement.is_deleted == False
    ).first()

    if not movement:
        raise HTTPException(status_code=404, detail="Harakat topilmadi")

    # Only allow editing PURCHASE type movements
    if movement.movement_type.value not in ['purchase', 'adjustment_plus', 'adjustment_minus']:
        raise HTTPException(status_code=400, detail="Faqat kirim va tuzatish harakatlarini tahrirlash mumkin")

    # Get current stock
    stock = db.query(Stock).filter(
        Stock.product_id == movement.product_id,
        Stock.warehouse_id == movement.warehouse_id
    ).first()

    old_quantity = movement.base_quantity

    # Handle UOM change
    target_uom_id = uom_id if uom_id is not None else movement.uom_id
    target_quantity = quantity if quantity is not None else movement.quantity

    # Calculate new base quantity
    product_uom = db.query(ProductUOMConversion).filter(
        ProductUOMConversion.product_id == movement.product_id,
        ProductUOMConversion.uom_id == target_uom_id
    ).first()

    if product_uom:
        new_base_quantity = target_quantity * Decimal(str(product_uom.conversion_factor))
    else:
        # If no conversion found, assume 1:1 (same as base UOM)
        new_base_quantity = target_quantity

    # Update stock if quantity changed
    if stock and (quantity is not None or uom_id is not None):
        quantity_diff = new_base_quantity - old_quantity
        stock.quantity = Decimal(str(stock.quantity)) + quantity_diff
        movement.stock_after = stock.quantity

    # Update movement fields
    if quantity is not None or uom_id is not None:
        movement.quantity = target_quantity
        movement.base_quantity = new_base_quantity

    if uom_id is not None:
        movement.uom_id = uom_id
        # Get UOM symbol for response
        uom = db.query(UnitOfMeasure).filter(UnitOfMeasure.id == uom_id).first()
        if uom:
            movement.uom_symbol = uom.symbol

    if unit_price is not None:
        movement.unit_cost = unit_price
        movement.total_cost = unit_price * movement.quantity

    if unit_price_usd is not None:
        movement.unit_price_usd = unit_price_usd

    if exchange_rate is not None:
        movement.exchange_rate = exchange_rate

    if document_number is not None:
        movement.document_number = document_number

    if supplier_name is not None:
        movement.supplier_name = supplier_name

    if notes is not None:
        movement.notes = notes

    # ===== RECALCULATE AVERAGE COST IN STOCK =====
    # If price changed, we need to recalculate average cost
    if unit_price_usd is not None or unit_price is not None:
        # Get all purchase movements for this product in this warehouse
        all_purchases = db.query(StockMovement).filter(
            StockMovement.product_id == movement.product_id,
            StockMovement.warehouse_id == movement.warehouse_id,
            StockMovement.movement_type.in_([MovementType.PURCHASE, MovementType.ADJUSTMENT_PLUS]),
            StockMovement.is_deleted == False
        ).all()

        # Calculate weighted average cost
        total_qty = Decimal('0')
        total_cost_uzs = Decimal('0')

        for m in all_purchases:
            qty = Decimal(str(m.base_quantity or 0))
            if qty > 0:
                total_qty += qty
                # UZS cost
                if m.unit_cost:
                    total_cost_uzs += qty * Decimal(str(m.unit_cost))

        # Update stock average cost
        if stock and total_qty > 0:
            stock.average_cost = total_cost_uzs / total_qty
            # Also update last_purchase_cost_usd if USD price was changed
            if unit_price_usd is not None:
                stock.last_purchase_cost_usd = unit_price_usd
            if unit_price is not None:
                stock.last_purchase_cost = unit_price

        # ===== UPDATE PRODUCT COST PRICE =====
        from database.models import Product
        product = db.query(Product).filter(Product.id == movement.product_id).first()
        if product:
            # Update product cost_price with new average cost or last purchase cost
            if stock and total_qty > 0:
                product.cost_price = total_cost_uzs / total_qty
            elif unit_price is not None:
                product.cost_price = unit_price

    # Track who edited
    movement.updated_by_id = current_user.id

    db.commit()

    return {
        "success": True,
        "message": "Harakat muvaffaqiyatli tahrirlandi",
        "data": {
            "id": movement.id,
            "updated_at": movement.updated_at.isoformat() if movement.updated_at else None
        }
    }


@router.delete(
    "/movements/{movement_id}",
    summary="Harakatni o'chirish (faqat Director)",
    dependencies=[Depends(PermissionChecker([PermissionType.DIRECTOR_OVERRIDE]))]
)
async def delete_movement(
    movement_id: int,
    reason: str = Query(..., min_length=3, description="O'chirish sababi"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Soft delete stock movement. Only Director can do this.
    This will also reverse the stock quantity change.
    """
    from database.models import StockMovement, Stock
    from datetime import datetime

    movement = db.query(StockMovement).filter(
        StockMovement.id == movement_id,
        StockMovement.is_deleted == False
    ).first()

    if not movement:
        raise HTTPException(status_code=404, detail="Harakat topilmadi")

    # Only allow deleting PURCHASE type movements
    if movement.movement_type.value not in ['purchase', 'adjustment_plus', 'adjustment_minus']:
        raise HTTPException(status_code=400, detail="Faqat kirim va tuzatish harakatlarini o'chirish mumkin")

    # Get current stock and reverse the change
    stock = db.query(Stock).filter(
        Stock.product_id == movement.product_id,
        Stock.warehouse_id == movement.warehouse_id
    ).first()

    if stock:
        if movement.movement_type.value in ['purchase', 'adjustment_plus']:
            # Reverse addition
            stock.quantity = Decimal(str(stock.quantity)) - movement.base_quantity
        else:
            # Reverse subtraction
            stock.quantity = Decimal(str(stock.quantity)) + movement.base_quantity

        # Ensure stock doesn't go negative
        if stock.quantity < 0:
            stock.quantity = 0

    # Soft delete
    movement.is_deleted = True
    movement.deleted_by_id = current_user.id
    movement.deleted_at = get_tashkent_now().isoformat()
    movement.deleted_reason = reason

    db.commit()

    return {
        "success": True,
        "message": "Harakat o'chirildi",
        "data": {
            "id": movement.id,
            "deleted_at": movement.deleted_at
        }
    }

# ─────────────────────────────────────────────────────────────
# EXCEL IMPORT ENDPOINT
# ─────────────────────────────────────────────────────────────

from fastapi import UploadFile, File, Form
import io
import openpyxl
from database.models import Product, UnitOfMeasure, Stock, StockMovement


# UOM mapping: Excel unit → DB symbol
_UOM_MAP = {
    "шт": "dona", "dona": "dona", "штука": "dona", "дона": "dona",
    "метр": "m", "м": "m", "meter": "m", "metr": "m",
    "кг": "kg", "kg": "kg", "килограмм": "kg",
    "т": "t", "тонна": "t", "тн": "t",
    "м²": "m²", "m2": "m²", "кв.м": "m²",
    "м³": "m³", "m3": "m³", "куб.м": "m³",
    "л": "l", "литр": "l",
}


def _get_uom(db: Session, raw_unit: str) -> UnitOfMeasure | None:
    """Resolve Excel unit string to DB UnitOfMeasure row."""
    symbol = _UOM_MAP.get((raw_unit or "шт").strip().lower(), "dona")
    return db.query(UnitOfMeasure).filter(UnitOfMeasure.symbol == symbol).first()


def _parse_decimal(val) -> Decimal:
    try:
        return Decimal(str(val)).quantize(Decimal("0.01"))
    except Exception:
        return Decimal("0")


def _read_excel_rows(file_bytes: bytes) -> list[dict]:
    """Parse Excel. Returns list of dicts with product fields."""
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    # Find header row (the one containing 'Название товара' or 'name')
    header_row_idx = None
    col_map = {}
    for i, row in enumerate(rows):
        row_lower = [str(c).strip().lower() if c else "" for c in row]
        if "название товара" in row_lower or "name" in row_lower:
            header_row_idx = i
            for j, cell in enumerate(row):
                if cell:
                    col_map[str(cell).strip().lower()] = j
            break

    if header_row_idx is None:
        return []

    # Column aliases
    def _col(*aliases):
        for a in aliases:
            if a in col_map:
                return col_map[a]
        return None

    name_col      = _col("название товара", "name", "tovar nomi")
    barcode_col   = _col("штрих-код", "barcode", "shtrix-kod")
    retail_col    = _col("цена розничная", "sotuv narxi", "sale price", "цена розн.", "retail price")
    cost_col      = _col("себестоимость", "kelish narxi", "cost price", "cost")
    qty_col       = _col("количество", "miqdor", "qty", "quantity")
    unit_col      = _col("ед. изм.", "unit", "o'lchov", "uom")
    article_col   = _col("артикул", "article", "artikul")
    vip_col       = _col("цена оптовая", "opt narxi", "wholesale price", "vip price")

    results = []
    for row in rows[header_row_idx + 1:]:
        if not row or row[name_col] is None:
            continue
        name = str(row[name_col]).strip() if row[name_col] else ""
        if not name or name.startswith("---") or name.startswith("==="):
            continue

        results.append({
            "name":       name,
            "barcode":    str(row[barcode_col]).strip() if barcode_col is not None and row[barcode_col] else None,
            "sale_price": _parse_decimal(row[retail_col]) if retail_col is not None else Decimal("0"),
            "cost_price": _parse_decimal(row[cost_col])   if cost_col is not None  else Decimal("0"),
            "quantity":   _parse_decimal(row[qty_col])    if qty_col is not None   else Decimal("0"),
            "unit_raw":   str(row[unit_col]).strip()      if unit_col is not None and row[unit_col] else "шт",
            "article":    str(row[article_col]).strip()   if article_col is not None and row[article_col] else None,
            "vip_price":  _parse_decimal(row[vip_col])   if vip_col is not None  else None,
        })

    return results


@router.post(
    "/import-excel/preview",
    summary="Excel faylni preview qilish (import qilishdan oldin)",
    dependencies=[Depends(PermissionChecker([PermissionType.STOCK_INCOME]))]
)
async def preview_excel_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Excel faylni yuklang va import bo'ladigan mahsulotlar ro'yxatini qaytaradi.
    Har bir qator uchun: yangi mahsulot | mavjud (ombordagi miqdor bilan).
    """
    content = await file.read()
    rows = _read_excel_rows(content)
    if not rows:
        raise HTTPException(status_code=400, detail="Excel faylda ma'lumot topilmadi yoki format noto'g'ri")

    preview = []
    for r in rows:
        existing: Product | None = None
        if r["barcode"]:
            existing = db.query(Product).filter(
                Product.barcode == r["barcode"],
                Product.is_deleted == False
            ).first()
        if not existing and r["article"]:
            existing = db.query(Product).filter(
                Product.article == r["article"],
                Product.is_deleted == False
            ).first()
        if not existing:
            existing = db.query(Product).filter(
                Product.name == r["name"],
                Product.is_deleted == False
            ).first()

        current_stock = 0
        if existing:
            stock_row = db.query(Stock).filter(Stock.product_id == existing.id).first()
            current_stock = float(stock_row.quantity) if stock_row else 0

        preview.append({
            "name":           r["name"],
            "barcode":        r["barcode"],
            "article":        r["article"],
            "sale_price":     float(r["sale_price"]),
            "cost_price":     float(r["cost_price"]),
            "quantity":       float(r["quantity"]),
            "unit":           r["unit_raw"],
            "vip_price":      float(r["vip_price"]) if r["vip_price"] else None,
            "status":         "existing" if existing else "new",
            "product_id":     existing.id if existing else None,
            "current_stock":  current_stock,
        })

    new_count      = sum(1 for p in preview if p["status"] == "new")
    existing_count = sum(1 for p in preview if p["status"] == "existing")

    return {
        "success": True,
        "total":   len(preview),
        "new":     new_count,
        "existing": existing_count,
        "rows":    preview
    }


@router.post(
    "/import-excel/confirm",
    summary="Excel importni tasdiqlash va saqlash",
    dependencies=[Depends(PermissionChecker([PermissionType.STOCK_INCOME]))]
)
async def confirm_excel_import(
    file: UploadFile = File(...),
    warehouse_id: int = Form(...),
    mode: str = Form(...),          # "add" | "replace"  — mavjud tovarlar uchun
    document_number: str = Form(""),
    notes: str = Form(""),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Excel faylni import qilish:
    - Yangi mahsulotlar yaratiladi
    - Mavjud mahsulotlar:
        mode='add'     → miqdor ustiga qo'shiladi
        mode='replace' → miqdor yangisi bilan almashtiriladi
    - Barcha mahsulotlar omborga kirim qilinadi
    """
    # Validate warehouse
    from database.models import Warehouse
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Ombor topilmadi")

    content = await file.read()
    rows = _read_excel_rows(content)
    if not rows:
        raise HTTPException(status_code=400, detail="Excel faylda ma'lumot topilmadi")

    stock_service = StockService(db)

    created = []
    updated = []
    errors  = []

    for r in rows:
        try:
            uom = _get_uom(db, r["unit_raw"])
            if not uom:
                errors.append({"name": r["name"], "error": f"O'lchov birligi topilmadi: {r['unit_raw']}"})
                continue

            # ── Find existing product ──
            existing: Product | None = None
            if r["barcode"]:
                existing = db.query(Product).filter(
                    Product.barcode == r["barcode"],
                    Product.is_deleted == False
                ).first()
            if not existing and r["article"]:
                existing = db.query(Product).filter(
                    Product.article == r["article"],
                    Product.is_deleted == False
                ).first()
            if not existing:
                existing = db.query(Product).filter(
                    Product.name == r["name"],
                    Product.is_deleted == False
                ).first()

            if existing:
                # ── Update prices ──
                if r["sale_price"] > 0:
                    existing.sale_price = r["sale_price"]
                if r["cost_price"] > 0:
                    existing.cost_price = r["cost_price"]
                if r["vip_price"] and r["vip_price"] > 0:
                    existing.vip_price = r["vip_price"]
                db.flush()

                product = existing
                action = "updated"
            else:
                # ── Create new product ──
                product = Product(
                    name=r["name"],
                    barcode=r["barcode"],
                    article=r["article"],
                    base_uom_id=uom.id,
                    cost_price=r["cost_price"],
                    sale_price=r["sale_price"],
                    vip_price=r["vip_price"],
                    is_active=True,
                    track_stock=True,
                    allow_negative_stock=False,
                )
                db.add(product)
                db.flush()
                action = "created"

            # ── Stock movement ──
            if r["quantity"] > 0:
                existing_stock = db.query(Stock).filter(
                    Stock.product_id == product.id,
                    Stock.warehouse_id == warehouse_id
                ).first()

                if mode == "replace" and existing_stock:
                    # Adjustment: set quantity to exact value
                    diff = Decimal(str(r["quantity"])) - existing_stock.quantity
                    if diff != 0:
                        movement = StockMovement(
                            product_id=product.id,
                            warehouse_id=warehouse_id,
                            movement_type=MovementType.ADJUSTMENT_PLUS if diff > 0 else MovementType.ADJUSTMENT_MINUS,
                            quantity=abs(diff),
                            base_quantity=abs(diff),
                            uom_id=uom.id,
                            unit_cost=r["cost_price"],
                            reference_type="excel_import",
                            document_number=document_number or "EXCEL-IMPORT",
                            notes=notes or "Excel import (almashtirish)",
                            created_by_id=current_user.id,
                        )
                        db.add(movement)
                        existing_stock.quantity = Decimal(str(r["quantity"]))
                else:
                    # Add mode: call existing service
                    stock_service.add_stock(
                        product_id=product.id,
                        warehouse_id=warehouse_id,
                        quantity=Decimal(str(r["quantity"])),
                        uom_id=uom.id,
                        unit_cost=r["cost_price"],
                        movement_type=MovementType.PURCHASE,
                        reference_type="excel_import",
                        document_number=document_number or "EXCEL-IMPORT",
                        notes=notes or "Excel import",
                        created_by_id=current_user.id,
                    )

            if action == "created":
                created.append({"id": product.id, "name": r["name"]})
            else:
                updated.append({"id": product.id, "name": r["name"]})

        except Exception as e:
            db.rollback()
            errors.append({"name": r["name"], "error": str(e)})
            continue

    db.commit()

    return {
        "success": True,
        "message": f"{len(created)} ta yangi, {len(updated)} ta yangilandi, {len(errors)} ta xato",
        "created": len(created),
        "updated": len(updated),
        "errors":  errors,
    }
