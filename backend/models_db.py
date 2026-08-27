from sqlalchemy import (
    Column, Integer, String, Boolean, Numeric, DateTime, Time, Text, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class MasterEquipment(Base):
    __tablename__ = "master_equipments"

    id = Column(Integer, primary_key=True, index=True)
    equipment_code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False, index=True)
    location = Column(String(100))
    category = Column(String(50), default="Digital")  # 'Digital' or 'Analog'
    status_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    equipment_parameters = relationship("EquipmentParameter", back_populates="equipment", cascade="all, delete-orphan")
    log_headers = relationship("LogHeader", back_populates="equipment")


class MasterParameter(Base):
    __tablename__ = "master_parameters"

    id = Column(Integer, primary_key=True, index=True)
    parameter_name = Column(String(50), unique=True, nullable=False, index=True)
    unit = Column(String(20))
    data_type = Column(String(20), default="DECIMAL")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    equipment_parameters = relationship("EquipmentParameter", back_populates="parameter")
    log_details = relationship("LogDetail", back_populates="parameter")


class EquipmentParameter(Base):
    __tablename__ = "equipment_parameters"

    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("master_equipments.id", ondelete="CASCADE"), nullable=False)
    parameter_id = Column(Integer, ForeignKey("master_parameters.id", ondelete="CASCADE"), nullable=False)
    normal_min_value = Column(Numeric(12, 4), nullable=True)
    normal_max_value = Column(Numeric(12, 4), nullable=True)
    sort_order = Column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint("equipment_id", "parameter_id", name="uq_equipment_parameter"),
    )

    # Relationships
    equipment = relationship("MasterEquipment", back_populates="equipment_parameters")
    parameter = relationship("MasterParameter", back_populates="equipment_parameters")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    badge_number = Column(String(50), unique=True, nullable=True, index=True)
    role = Column(String(50), default="Technician")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    log_headers = relationship("LogHeader", back_populates="user")


class MasterShift(Base):
    __tablename__ = "master_shifts"

    id = Column(Integer, primary_key=True, index=True)
    shift_name = Column(String(50), nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    # Relationships
    log_headers = relationship("LogHeader", back_populates="shift")


class LogHeader(Base):
    __tablename__ = "log_headers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    shift_id = Column(Integer, ForeignKey("master_shifts.id", ondelete="SET NULL"), nullable=True)
    equipment_id = Column(Integer, ForeignKey("master_equipments.id", ondelete="CASCADE"), nullable=False, index=True)
    inspected_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    general_notes = Column(Text, nullable=True)
    status = Column(String(50), default="PENDING", index=True)  # PENDING, PROCESSING, COMPLETED, FAILED
    validation_status = Column(String(50), default="PENDING")  # PENDING, VERIFIED, REJECTED
    photo_path = Column(String(500), nullable=True)

    ocr_filename = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="log_headers")
    shift = relationship("MasterShift", back_populates="log_headers")
    equipment = relationship("MasterEquipment", back_populates="log_headers")
    log_details = relationship("LogDetail", back_populates="log_header", cascade="all, delete-orphan")


class LogDetail(Base):
    __tablename__ = "log_details"

    id = Column(Integer, primary_key=True, index=True)
    log_header_id = Column(Integer, ForeignKey("log_headers.id", ondelete="CASCADE"), nullable=False, index=True)
    parameter_id = Column(Integer, ForeignKey("master_parameters.id", ondelete="CASCADE"), nullable=False)
    raw_ocr_value = Column(String(100), nullable=True)
    verified_value = Column(Numeric(12, 4), nullable=True)
    value_text = Column(String(100), nullable=True)
    is_abnormal = Column(Boolean, default=False)
    is_edited = Column(Boolean, default=False)
    cer_score = Column(Numeric(5, 2), nullable=True)

    __table_args__ = (
        UniqueConstraint("log_header_id", "parameter_id", name="uq_log_detail_parameter"),
    )

    # Relationships
    log_header = relationship("LogHeader", back_populates="log_details")
    parameter = relationship("MasterParameter", back_populates="log_details")
