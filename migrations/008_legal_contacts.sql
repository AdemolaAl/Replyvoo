-- Fill the legal pages already stored in the database: company name, Lagos, contact emails and the Voo Squad minimum.
UPDATE pages SET body_md = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(body_md,
  'a company registered in Nigeria with RC number [RC NUMBER] and its registered address at [REGISTERED ADDRESS]', 'a company based in Lagos, Nigeria'),
  ', RC [RC NUMBER], of [REGISTERED ADDRESS],', ', based in Lagos, Nigeria,'),
  ', RC [RC NUMBER], of [REGISTERED ADDRESS]', ', based in Lagos, Nigeria'),
  char(10) || 'RC [RC NUMBER]', ''),
  '[ZEDAPEX LEGAL NAME]' || char(10) || '[REGISTERED ADDRESS]', 'Zedapex Limited, Lagos, Nigeria' || char(10)),
  '[ZEDAPEX LEGAL NAME]', 'Zedapex Limited'),
  '[REGISTERED ADDRESS]', 'Lagos, Nigeria'),
  '[SUPPORT EMAIL]', 'support@replyvoo.com'),
  '[LEGAL EMAIL]', 'legal@replyvoo.com'),
  '[PRIVACY EMAIL]', 'privacy@replyvoo.com'),
  '[MINIMUM PAYOUT]', '$300 (USD)');
