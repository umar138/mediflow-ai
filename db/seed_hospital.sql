-- Seed data for hospitals, specializations, doctors

INSERT INTO hospitals (slug, name) VALUES
    ('mediflow-demo-hospital', 'Mediflow Demo Hospital')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO specializations (code, name) VALUES
    ('CARD', 'Cardiology'),
    ('EMER', 'Emergency'),
    ('ORTH', 'Orthopedics')
ON CONFLICT (code) DO NOTHING;

-- Doctors (5 entries)
INSERT INTO doctors (hospital_id, email, full_name, password_hash, specialization_id) VALUES
    (
        (SELECT hospital_id FROM hospitals WHERE slug='mediflow-demo-hospital'),
        'dr.ahmed@mediflowdemo.com',
        'Dr. Ahmed Al‑Saadi',
        crypt('DemoPass123!', gen_salt('bf')),
        (SELECT specialization_id FROM specializations WHERE code='CARD')
    ),
    (
        (SELECT hospital_id FROM hospitals WHERE slug='mediflow-demo-hospital'),
        'dr.sara@mediflowdemo.com',
        'Dr. Sara Khan',
        crypt('DemoPass123!', gen_salt('bf')),
        (SELECT specialization_id FROM specializations WHERE code='EMER')
    ),
    (
        (SELECT hospital_id FROM hospitals WHERE slug='mediflow-demo-hospital'),
        'dr.ali@mediflowdemo.com',
        'Dr. Ali Mahmood',
        crypt('DemoPass123!', gen_salt('bf')),
        (SELECT specialization_id FROM specializations WHERE code='ORTH')
    ),
    (
        (SELECT hospital_id FROM hospitals WHERE slug='mediflow-demo-hospital'),
        'dr.lara@mediflowdemo.com',
        'Dr. Lara Patel',
        crypt('DemoPass123!', gen_salt('bf')),
        (SELECT specialization_id FROM specializations WHERE code='CARD')
    ),
    (
        (SELECT hospital_id FROM hospitals WHERE slug='mediflow-demo-hospital'),
        'dr.omar@mediflowdemo.com',
        'Dr. Omar Rashid',
        crypt('DemoPass123!', gen_salt('bf')),
        (SELECT specialization_id FROM specializations WHERE code='EMER')
    )
ON CONFLICT (email) DO NOTHING;
