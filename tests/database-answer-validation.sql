do $$
begin
  assert not app_private.answer_has_value('{"_previous":"legacy"}');
  assert not app_private.answer_has_value('{"selection":[],"comment":"alone"}');
  assert app_private.answer_has_value('0');
  assert not app_private.answer_matches_schema('{}', true, 'textarea', '[]', '{"fields":[{"key":"Email","type":"email"}]}');
  assert not app_private.answer_matches_schema('{"Email":"invalid"}', true, 'textarea', '[]', '{"fields":[{"key":"Email","type":"email"}]}');
  assert app_private.answer_matches_schema('{"Email":"a@example.com"}', true, 'textarea', '[]', '{"fields":[{"key":"Email","type":"email"}]}');
  assert app_private.answer_matches_schema('{"selection":"Yes","comment":"context"}', true, 'single_choice', '["Yes","No"]', '{}');
  assert not app_private.answer_matches_schema('{"selection":"Other"}', true, 'single_choice', '["Yes","No"]', '{}');
  assert not app_private.answer_matches_schema('" "', true, 'number', '[]', '{}');
  assert app_private.answer_matches_schema('{"Tier 1":"0%"}', true, 'textarea', '[]', '{"fields":[{"key":"Tier 1","type":"select","options":["0%","1-25%"]}]}');
end;
$$;
