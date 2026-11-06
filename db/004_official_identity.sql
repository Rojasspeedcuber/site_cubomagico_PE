-- Apply only supplied identity/contact information to legacy empty fields.
-- Existing non-empty editorial settings are never overwritten.
INSERT INTO content(key,value) VALUES
 ('logoUrl','https://cubomagicope.rojasdev.site/imgs/logo-cubo-pe.jpeg'),
 ('contactEmail','henriquer01@rojasdev.cloud'),
 ('developerContact','henriquer01@rojasdev.cloud')
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value WHERE content.value='';
