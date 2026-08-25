from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
import models_db as models

# ==========================================
# MASTER EQUIPMENTS (PANELS)
# ==========================================

def get_equipments(db: Session, active_only: bool = True) -> List[models.MasterEquipment]:
    query = db.query(models.MasterEquipment).options(
        joinedload(models.MasterEquipment.equipment_parameters).joinedload(models.EquipmentParameter.parameter)
    )
    if active_only:
        query = query.filter(models.MasterEquipment.status_active == True)
    return query.all()

def get_equipment_by_code_or_name(db: Session, identifier: str) -> Optional[models.MasterEquipment]:
    return db.query(models.MasterEquipment).options(
        joinedload(models.MasterEquipment.equipment_parameters).joinedload(models.EquipmentParameter.parameter)
    ).filter(
        (models.MasterEquipment.equipment_code == identifier) | (models.MasterEquipment.name == identifier)
    ).first()

def create_or_update_equipment(
    db: Session,
    name: str,
    location: str = "",
    category: str = "Digital",
    equipment_code: Optional[str] = None,
    parameters: Optional[List[Dict[str, Any]]] = None
) -> models.MasterEquipment:
    code = equipment_code or f"PNL-{name.replace(' ', '_').upper()}"
    eq = db.query(models.MasterEquipment).filter(
        (models.MasterEquipment.equipment_code == code) | (models.MasterEquipment.name == name)
    ).first()

    if not eq:
        eq = models.MasterEquipment(
            equipment_code=code,
            name=name,
            location=location,
            category=category,
            status_active=True
        )
        db.add(eq)
        db.commit()
        db.refresh(eq)
    else:
        eq.name = name
        eq.location = location
        eq.category = category
        db.commit()

    # Update parameters if provided
    if parameters is not None:
        # Clear existing equipment_parameters
        db.query(models.EquipmentParameter).filter(models.EquipmentParameter.equipment_id == eq.id).delete()
        db.commit()

        for idx, param in enumerate(parameters):
            p_name = param.get("name") if isinstance(param, dict) else str(param)
            p_unit = param.get("unit", "") if isinstance(param, dict) else ""
            p_min = param.get("min") if isinstance(param, dict) else None
            p_max = param.get("max") if isinstance(param, dict) else None

            # Get or create master_parameter
            m_param = db.query(models.MasterParameter).filter(models.MasterParameter.parameter_name == p_name).first()
            if not m_param:
                m_param = models.MasterParameter(parameter_name=p_name, unit=p_unit)
                db.add(m_param)
                db.commit()
                db.refresh(m_param)
            elif p_unit and not m_param.unit:
                m_param.unit = p_unit
                db.commit()

            # Create link
            eq_param = models.EquipmentParameter(
                equipment_id=eq.id,
                parameter_id=m_param.id,
                normal_min_value=p_min,
                normal_max_value=p_max,
                sort_order=idx + 1
            )
            db.add(eq_param)
        db.commit()
        db.refresh(eq)

    return eq

def delete_equipment(db: Session, equipment_id_or_code: str) -> bool:
    eq = db.query(models.MasterEquipment).filter(
        (models.MasterEquipment.equipment_code == equipment_id_or_code) |
        (models.MasterEquipment.id.cast(models.String) == str(equipment_id_or_code))
    ).first()
    if eq:
        db.delete(eq)
        db.commit()
        return True
    return False

# ==========================================
# USERS & SHIFTS
# ==========================================

def get_or_create_user(db: Session, name: str) -> models.User:
    user = db.query(models.User).filter(models.User.name == name).first()
    if not user:
        user = models.User(name=name, badge_number=f"USR-{name.replace(' ', '_').upper()}", role="Technician")
        db.add(user)
        db.commit()
        db.refresh(user)
    return user

def get_or_create_shift(db: Session, shift_identifier: str) -> Optional[models.MasterShift]:
    shift_name = f"Shift {shift_identifier}" if not shift_identifier.lower().startswith("shift") else shift_identifier
    shift = db.query(models.MasterShift).filter(models.MasterShift.shift_name == shift_name).first()
    if not shift:
        # Fallback default
        shift = db.query(models.MasterShift).first()
    return shift

# ==========================================
# LOG HEADERS & LOG DETAILS (READINGS)
# ==========================================

def get_all_log_headers(db: Session, limit: int = 200) -> List[models.LogHeader]:
    return db.query(models.LogHeader).options(
        joinedload(models.LogHeader.equipment),
        joinedload(models.LogHeader.user),
        joinedload(models.LogHeader.shift),
        joinedload(models.LogHeader.log_details).joinedload(models.LogDetail.parameter)
    ).order_by(desc(models.LogHeader.inspected_at)).limit(limit).all()

def get_log_header_by_id(db: Session, header_id: int) -> Optional[models.LogHeader]:
    return db.query(models.LogHeader).options(
        joinedload(models.LogHeader.equipment),
        joinedload(models.LogHeader.user),
        joinedload(models.LogHeader.shift),
        joinedload(models.LogHeader.log_details).joinedload(models.LogDetail.parameter)
    ).filter(models.LogHeader.id == header_id).first()

def get_log_header_by_filename(db: Session, filename: str) -> Optional[models.LogHeader]:
    return db.query(models.LogHeader).options(
        joinedload(models.LogHeader.equipment),
        joinedload(models.LogHeader.user),
        joinedload(models.LogHeader.shift),
        joinedload(models.LogHeader.log_details).joinedload(models.LogDetail.parameter)
    ).filter(models.LogHeader.ocr_filename == filename).first()

def compute_cer(raw_ocr: Optional[Any], verified: Optional[Any]) -> tuple[float, bool]:
    """
    Compute Character Error Rate (CER) and is_edited flag using Levenshtein distance.
    CER = EditDistance(raw_ocr_str, verified_str) / len(verified_str)
    """
    if raw_ocr is None or verified is None or raw_ocr == "" or verified == "":
        return 0.0, False

    raw_str = str(raw_ocr).strip()
    ver_str = str(verified).strip()

    if raw_str == ver_str:
        return 0.0, False

    # Check numerical equality (e.g. 230.0 == 230.00)
    try:
        if abs(float(raw_str) - float(ver_str)) < 1e-6:
            return 0.0, False
    except (ValueError, TypeError):
        pass

    m, n = len(raw_str), len(ver_str)
    if n == 0:
        return (1.0 if m > 0 else 0.0), (m > 0)

    # Dynamic programming for Levenshtein edit distance
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if raw_str[i - 1] == ver_str[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])

    dist = dp[m][n]
    cer = round(float(dist) / float(n), 4)
    return cer, True


def save_reading_to_db(
    db: Session,
    panel_name: str,
    operator_name: str,
    shift_str: str,
    photo_path: str,
    ocr_filename: str,
    notes: str = "",
    status: str = "PENDING",
    validation_status: str = "PENDING",
    ocr_readings: Optional[Dict[str, Any]] = None,
    verified_readings: Optional[List[Dict[str, Any]]] = None
) -> models.LogHeader:
    # 1. Equipment
    eq = get_equipment_by_code_or_name(db, panel_name)
    if not eq:
        eq = create_or_update_equipment(db, name=panel_name)

    # 2. User & Shift
    user = get_or_create_user(db, operator_name or "Unknown")
    shift = get_or_create_shift(db, shift_str or "1")

    # 3. Create or find existing LogHeader by ocr_filename
    header = None
    if ocr_filename:
        header = db.query(models.LogHeader).filter(models.LogHeader.ocr_filename == ocr_filename).first()

    if not header:
        header = models.LogHeader(
            equipment_id=eq.id,
            user_id=user.id if user else None,
            shift_id=shift.id if shift else None,
            photo_path=photo_path,
            ocr_filename=ocr_filename,
            general_notes=notes,
            status=status or "PENDING",
            validation_status=validation_status or "PENDING"
        )
        db.add(header)
        db.commit()
        db.refresh(header)
    else:
        if status:
            header.status = status
        # Only update validation_status if explicitly provided and not empty
        if validation_status and validation_status in ("PENDING", "VERIFIED", "REJECTED"):
            if not (header.validation_status == "VERIFIED" and validation_status == "PENDING"):
                header.validation_status = validation_status
        if notes:
            header.general_notes = notes
        if photo_path and (not header.photo_path or header.photo_path != photo_path):
            header.photo_path = photo_path
        db.commit()

    # 4. Save Details if readings provided
    details_map = {}
    if verified_readings:
        for vr in verified_readings:
            p_name = vr.get("name") or vr.get("parameter_name")
            p_val = vr.get("value")
            p_unit = vr.get("unit", "")
            if p_name:
                details_map[p_name] = {
                    "verified_value": p_val,
                    "unit": p_unit,
                    "raw_ocr_value": (ocr_readings.get(p_name) if ocr_readings else None),
                    "is_edited": vr.get("is_edited", False)
                }

    if ocr_readings:
        for k, v in ocr_readings.items():
            if k not in details_map:
                details_map[k] = {
                    "verified_value": v,
                    "raw_ocr_value": v,
                    "is_edited": False
                }

    # Save to log_details
    for param_name, detail_data in details_map.items():
        m_param = db.query(models.MasterParameter).filter(models.MasterParameter.parameter_name == param_name).first()
        if not m_param:
            m_param = models.MasterParameter(parameter_name=param_name, unit=detail_data.get("unit", ""))
            db.add(m_param)
            db.commit()
            db.refresh(m_param)

        # Check existing detail
        detail = db.query(models.LogDetail).filter(
            models.LogDetail.log_header_id == header.id,
            models.LogDetail.parameter_id == m_param.id
        ).first()

        v_val = detail_data.get("verified_value")
        raw_val = detail_data.get("raw_ocr_value")

        # Convert numeric
        num_val = None
        txt_val = None
        if v_val is not None:
            try:
                num_val = float(v_val)
            except (ValueError, TypeError):
                txt_val = str(v_val)

        # Determine raw OCR baseline to compare against
        effective_raw = raw_val
        if effective_raw is None and detail and detail.raw_ocr_value is not None:
            effective_raw = detail.raw_ocr_value

        # Calculate CER and is_edited
        cer, auto_edited = compute_cer(effective_raw, v_val)
        final_is_edited = detail_data.get("is_edited", False) or auto_edited

        # Detect is_abnormal based on equipment parameter limits
        is_abnormal = False
        if num_val is not None:
            eq_param = db.query(models.EquipmentParameter).filter(
                models.EquipmentParameter.equipment_id == header.equipment_id,
                models.EquipmentParameter.parameter_id == m_param.id
            ).first()
            if eq_param:
                if eq_param.normal_min_value is not None and num_val < float(eq_param.normal_min_value):
                    is_abnormal = True
                if eq_param.normal_max_value is not None and num_val > float(eq_param.normal_max_value):
                    is_abnormal = True

        if not detail:
            detail = models.LogDetail(
                log_header_id=header.id,
                parameter_id=m_param.id,
                raw_ocr_value=str(effective_raw) if effective_raw is not None else None,
                verified_value=num_val,
                value_text=txt_val,
                is_abnormal=is_abnormal,
                is_edited=final_is_edited,
                cer_score=cer if cer > 0 else (0.0 if effective_raw is not None else None)
            )
            db.add(detail)
        else:
            if effective_raw is not None and not detail.raw_ocr_value:
                detail.raw_ocr_value = str(effective_raw)
            if num_val is not None:
                detail.verified_value = num_val
            if txt_val is not None:
                detail.value_text = txt_val
            detail.is_edited = final_is_edited
            detail.is_abnormal = is_abnormal
            detail.cer_score = cer

    db.commit()
    db.refresh(header)
    return header

