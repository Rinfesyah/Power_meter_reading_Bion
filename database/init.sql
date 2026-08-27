-- ==========================================================
-- DC-Ops OCR: PostgreSQL Database Initialization Schema
-- Version: 1.0
-- ==========================================================

-- 1. Tabel Master Equipments (Panel / Alat Ukur Listrik)
CREATE TABLE IF NOT EXISTS master_equipments (
    id SERIAL PRIMARY KEY,
    equipment_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(100),
    category VARCHAR(50) DEFAULT 'Digital', -- 'Digital' / 'Analog'
    status_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabel Master Parameters (Daftar Parameter Standar)
CREATE TABLE IF NOT EXISTS master_parameters (
    id SERIAL PRIMARY KEY,
    parameter_name VARCHAR(50) UNIQUE NOT NULL,
    unit VARCHAR(20),
    data_type VARCHAR(20) DEFAULT 'DECIMAL',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabel Equipment Parameters (Mapping Parameter, Urutan & Batas Ambang per Alat)
CREATE TABLE IF NOT EXISTS equipment_parameters (
    id SERIAL PRIMARY KEY,
    equipment_id INT NOT NULL REFERENCES master_equipments(id) ON DELETE CASCADE,
    parameter_id INT NOT NULL REFERENCES master_parameters(id) ON DELETE CASCADE,
    normal_min_value DECIMAL(12, 4),
    normal_max_value DECIMAL(12, 4),
    sort_order INT DEFAULT 0,
    CONSTRAINT uq_equipment_parameter UNIQUE (equipment_id, parameter_id)
);

-- 4. Tabel Users (Operator / Teknisi / Supervisor)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    badge_number VARCHAR(50) UNIQUE,
    role VARCHAR(50) DEFAULT 'Technician', -- 'Technician', 'Supervisor', 'Admin'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabel Master Shifts
CREATE TABLE IF NOT EXISTS master_shifts (
    id SERIAL PRIMARY KEY,
    shift_name VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL
);

-- 6. Tabel Log Headers (Header Transaksi Inspeksi & Bukti Foto)
CREATE TABLE IF NOT EXISTS log_headers (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    shift_id INT REFERENCES master_shifts(id) ON DELETE SET NULL,
    equipment_id INT NOT NULL REFERENCES master_equipments(id) ON DELETE CASCADE,
    inspected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    general_notes TEXT,
    status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'
    validation_status VARCHAR(50) DEFAULT 'AUTO_APPROVED', -- 'AUTO_APPROVED', 'MANUALLY_VERIFIED', 'REJECTED'
    photo_path VARCHAR(500),
    ocr_filename VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexing untuk query analitik cepat berdasarkan waktu, panel, dan status
CREATE INDEX IF NOT EXISTS idx_log_headers_inspected_at ON log_headers(inspected_at);
CREATE INDEX IF NOT EXISTS idx_log_headers_equipment_id ON log_headers(equipment_id);
CREATE INDEX IF NOT EXISTS idx_log_headers_status ON log_headers(status);

-- 7. Tabel Log Details (Detail Nilai per Parameter + Ground Truth OCR)
CREATE TABLE IF NOT EXISTS log_details (
    id SERIAL PRIMARY KEY,
    log_header_id INT NOT NULL REFERENCES log_headers(id) ON DELETE CASCADE,
    parameter_id INT NOT NULL REFERENCES master_parameters(id) ON DELETE CASCADE,
    raw_ocr_value VARCHAR(100),
    verified_value DECIMAL(12, 4),
    value_text VARCHAR(100),
    is_abnormal BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN DEFAULT FALSE,
    cer_score DECIMAL(5, 2),
    CONSTRAINT uq_log_detail_parameter UNIQUE (log_header_id, parameter_id)
);

CREATE INDEX IF NOT EXISTS idx_log_details_header_id ON log_details(log_header_id);

-- ==========================================================
-- INITIAL SEED DATA
-- ==========================================================

-- Seed Shifts
INSERT INTO master_shifts (shift_name, start_time, end_time) VALUES
('Shift 1', '07:00:00', '15:00:00'),
('Shift 2', '15:00:00', '23:00:00'),
('Shift 3', '23:00:00', '07:00:00')
ON CONFLICT DO NOTHING;

-- Seed Default Users
INSERT INTO users (name, badge_number, role) VALUES
('Default Technician', 'TECH-001', 'Technician'),
('Supervisor Ops', 'SPV-001', 'Supervisor'),
('Administrator', 'ADM-001', 'Admin')
ON CONFLICT (badge_number) DO NOTHING;

-- Seed Master Parameters
INSERT INTO master_parameters (parameter_name, unit, data_type) VALUES
('Vavg', 'V', 'DECIMAL'),
('Iavg', 'A', 'DECIMAL'),
('Ptot', 'kW', 'DECIMAL'),
('E Del', 'MWh', 'DECIMAL'),
('Freq', 'Hz', 'DECIMAL'),
('PF', '', 'DECIMAL'),
('V_L1_N', 'V', 'DECIMAL'),
('V_L2_N', 'V', 'DECIMAL'),
('V_L3_N', 'V', 'DECIMAL'),
('I_L1', 'A', 'DECIMAL'),
('I_L2', 'A', 'DECIMAL'),
('I_L3', 'A', 'DECIMAL')
ON CONFLICT (parameter_name) DO NOTHING;

-- Seed Initial Equipments (Panels)
INSERT INTO master_equipments (equipment_code, name, location, category, status_active) VALUES
('PNL-SCH-01', 'Schneider_Default', 'Main Power Room', 'Digital', TRUE),
('PNL-PAC-A', 'PAC.A', 'Data Center Hall A', 'Digital', TRUE),
('PNL-UPS-01', 'UPS 1', 'UPS Room 1', 'Digital', TRUE),
('PNL-UPS-02', 'UPS 2', 'UPS Room 2', 'Digital', TRUE),
('PNL-MDP-01', 'MDP', 'Electrical Substation', 'Digital', TRUE)
ON CONFLICT (equipment_code) DO NOTHING;

-- Seed Equipment Parameters for Default Panels
DO $$
DECLARE
    eq_record RECORD;
    p_vavg INT;
    p_iavg INT;
    p_ptot INT;
    p_edel INT;
BEGIN
    SELECT id INTO p_vavg FROM master_parameters WHERE parameter_name = 'Vavg';
    SELECT id INTO p_iavg FROM master_parameters WHERE parameter_name = 'Iavg';
    SELECT id INTO p_ptot FROM master_parameters WHERE parameter_name = 'Ptot';
    SELECT id INTO p_edel FROM master_parameters WHERE parameter_name = 'E Del';

    FOR eq_record IN SELECT id FROM master_equipments LOOP
        -- Vavg: Min 200V, Max 245V
        INSERT INTO equipment_parameters (equipment_id, parameter_id, normal_min_value, normal_max_value, sort_order)
        VALUES (eq_record.id, p_vavg, 200.0, 245.0, 1)
        ON CONFLICT (equipment_id, parameter_id) DO NOTHING;

        -- Iavg: Min 0A, Max 500A
        INSERT INTO equipment_parameters (equipment_id, parameter_id, normal_min_value, normal_max_value, sort_order)
        VALUES (eq_record.id, p_iavg, 0.0, 500.0, 2)
        ON CONFLICT (equipment_id, parameter_id) DO NOTHING;

        -- Ptot: Min 0kW, Max 200kW
        INSERT INTO equipment_parameters (equipment_id, parameter_id, normal_min_value, normal_max_value, sort_order)
        VALUES (eq_record.id, p_ptot, 0.0, 200.0, 3)
        ON CONFLICT (equipment_id, parameter_id) DO NOTHING;

        -- E Del
        INSERT INTO equipment_parameters (equipment_id, parameter_id, normal_min_value, normal_max_value, sort_order)
        VALUES (eq_record.id, p_edel, 0.0, 999999.0, 4)
        ON CONFLICT (equipment_id, parameter_id) DO NOTHING;
    END LOOP;
END $$;
