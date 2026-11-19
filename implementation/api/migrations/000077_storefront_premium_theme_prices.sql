INSERT INTO plan_versions (
    plan_code, version, display_name, subject_type, billing_interval,
    currency, price_minor, is_addon, addon_type
) VALUES
    ('storefront_theme_studio', 1, 'Studio storefront template', 'business', 'once', 'NGN', 1000000, true, 'storefront_theme_studio'),
    ('storefront_theme_market', 1, 'Market storefront template', 'business', 'once', 'NGN', 1000000, true, 'storefront_theme_market')
ON CONFLICT (plan_code, version) DO NOTHING;
