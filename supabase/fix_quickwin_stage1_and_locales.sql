-- =============================================================================
-- TrophyBase – Quickwin Stage-1 Titel-/Trophäen-Fallback & Locale-Freigabe
-- =============================================================================
-- Idempotente Migration (CREATE OR REPLACE FUNCTION, identische Signaturen,
-- SECURITY DEFINER & search_path = 'public' wie im Live-Bestand).
--
-- 1. tb_sync_guide_trophies_for_game(uuid):
--    - Synchronisiert fehlende/leere Zielsprachen in game_guides.item_name aus
--      game_achievements.trophy_name auch dann nach, wenn de/en bereits gefüllt
--      sind (behebt fehlendes fi/sv/pl/ar trotz vorhandener Sony-Trophäendaten).
--    - Fällt bei spiel_typ = 'Quickwin' für fehlende Locales (z. B. fi/sv)
--      NULL-sicher auf en -> de zurück.
--
-- 2. tb_apply_stage1_sql_for_game(uuid):
--    - Fällt in Stufe 3 (Spieltitel-Match auf game_guides.item_name) bei
--      Quickwins bzw. unübersetzt identischen Spieltiteln für alle 16 Ziel-
--      sprachen (inkl. fi/sv) NULL-sicher auf spieltitel->>loc -> en -> de
--      zurück (ohne jsonb_set(..., NULL)).
--
-- 3. tb_check_and_publish_locale(uuid, text, boolean):
--    - Ignoriert ausschließlich bei btrim(coalesce(spiel_typ, '')) = 'Quickwin'
--      fehlende Zielsprachen-Einträge in beschreibung, status_explanation_localized,
--      guide_tip und "Guide-Tip-lang" als Blocker (Frontend nutzt de/en-Fallback).
--    - Alle anderen Spieltypen (Evergreen, Premium, Standard, easy_platin,
--      Servertot) behalten zu 100 % die strenge 0-Lücken-Prüfung.
--    - Schützt reine Asien-Listen (Quellsprache ja/ko/zh-hans/zh-hant ohne
--      lateinische de/en-Trophäennamen bzw. status->>'asian_only' = 'true') vor
--      automatischer West-Veröffentlichung.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tb_sync_guide_trophies_for_game(p_game_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_updated_a integer := 0;
  v_updated_b integer := 0;
  v_spiel_typ text;
  v_is_quickwin boolean := false;
  v_allowed text[] := array['de','en','fr','es','it','nl','pt','ru','ja','ko','zh-hans','zh-hant','fi','sv','pl','ar'];
begin
  if p_game_id is null then
    return 0;
  end if;

  select g.spiel_typ into v_spiel_typ
  from public.games g
  where g.id = p_game_id;

  v_is_quickwin := (btrim(coalesce(v_spiel_typ, '')) = 'Quickwin');

  -- Fall A: trophy_id ist gesetzt UND der Text in item_name stimmt mit dem Trophäennamen überein
  with raw_src as (
    select
      gg.id as guide_row_id,
      public.tb_zh_fallback_jsonb(
        case
          when position(' - ' in coalesce(gg.item_name ->> 'en', gg.item_name ->> 'de', '')) > 0
               and jsonb_typeof(ga.trophy_desc) = 'object'
          then (
            select coalesce(jsonb_object_agg(
              n.key,
              case
                when btrim(coalesce(ga.trophy_desc ->> n.key, '')) <> ''
                then n.value || ' - ' || (ga.trophy_desc ->> n.key)
                else n.value
              end
            ), '{}'::jsonb)
            from jsonb_each_text(coalesce(ga.trophy_name, '{}'::jsonb)) n
            where btrim(coalesce(n.value, '')) <> ''
          )
          else coalesce(ga.trophy_name, '{}'::jsonb)
        end
      ) as base_json
    from public.game_guides gg
    join public.game_achievements ga
      on ga.game_id = p_game_id
     and ga.platform_achievement_id = gg.trophy_id
    where gg.game_id = p_game_id
      and gg.trophy_id is not null
      and btrim(gg.trophy_id) <> ''
      and (
        (
          public.tb_clean_trophy_match(gg.item_name ->> 'de') <> ''
          and (
            public.tb_clean_trophy_match(gg.item_name ->> 'de') = public.tb_clean_trophy_match(ga.trophy_name ->> 'de')
            or public.tb_clean_trophy_match(split_part(gg.item_name ->> 'de', ' - ', 1)) = public.tb_clean_trophy_match(ga.trophy_name ->> 'de')
          )
        )
        or (
          public.tb_clean_trophy_match(gg.item_name ->> 'en') <> ''
          and (
            public.tb_clean_trophy_match(gg.item_name ->> 'en') = public.tb_clean_trophy_match(ga.trophy_name ->> 'en')
            or public.tb_clean_trophy_match(split_part(gg.item_name ->> 'en', ' - ', 1)) = public.tb_clean_trophy_match(ga.trophy_name ->> 'en')
          )
        )
      )
  ),
  src as (
    select
      r.guide_row_id,
      case
        when v_is_quickwin then
          coalesce(r.base_json, '{}'::jsonb) || coalesce((
            select jsonb_object_agg(loc, fb.val)
            from unnest(v_allowed) as loc
            cross join lateral (
              select coalesce(
                nullif(btrim(r.base_json ->> loc), ''),
                nullif(btrim(r.base_json ->> 'en'), ''),
                nullif(btrim(r.base_json ->> 'de'), '')
              ) as val
            ) fb
            where fb.val is not null
          ), '{}'::jsonb)
        else coalesce(r.base_json, '{}'::jsonb)
      end as gebaute_namen
    from raw_src r
  )
  update public.game_guides gg
  set item_name = coalesce(s.gebaute_namen, '{}'::jsonb) || (
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each_text(coalesce(gg.item_name, '{}'::jsonb)) e
    where btrim(coalesce(e.value, '')) <> ''
  )
  from src s
  where gg.id = s.guide_row_id
    and exists (
      select 1
      from jsonb_each_text(s.gebaute_namen) t(k, v)
      where btrim(coalesce(t.v, '')) <> ''
        and btrim(coalesce(gg.item_name ->> t.k, '')) = ''
    );
  get diagnostics v_updated_a = row_count;

  -- Fall B: trophy_id ist noch leer -> Match über vollen Namen ODER linken Teil vor " - "
  with g_clean as materialized (
    select
      gg.id as guide_row_id,
      gg.item_name,
      (position(' - ' in coalesce(gg.item_name ->> 'en', gg.item_name ->> 'de', '')) > 0) as has_dash,
      public.tb_clean_trophy_match(coalesce(gg.item_name ->> 'de', gg.item_name ->> 'en')) as full_clean,
      public.tb_clean_trophy_match(split_part(coalesce(gg.item_name ->> 'en', ''), ' - ', 1)) as left_en,
      public.tb_clean_trophy_match(split_part(coalesce(gg.item_name ->> 'de', ''), ' - ', 1)) as left_de
    from public.game_guides gg
    where gg.game_id = p_game_id
      and coalesce(btrim(gg.trophy_id), '') = ''
  ),
  a_clean as materialized (
    select
      ga.platform_achievement_id,
      ga.trophy_name,
      ga.trophy_desc,
      public.tb_clean_trophy_match(ga.trophy_name ->> 'de') as name_de,
      public.tb_clean_trophy_match(ga.trophy_name ->> 'en') as name_en
    from public.game_achievements ga
    where ga.game_id = p_game_id
  ),
  matched_raw as (
    select distinct on (g.guide_row_id)
      g.guide_row_id,
      a.platform_achievement_id as neue_trophy_id,
      public.tb_zh_fallback_jsonb(
        case
          when g.has_dash and jsonb_typeof(a.trophy_desc) = 'object'
          then (
            select coalesce(jsonb_object_agg(
              n.key,
              case
                when btrim(coalesce(a.trophy_desc ->> n.key, '')) <> ''
                then n.value || ' - ' || (a.trophy_desc ->> n.key)
                else n.value
              end
            ), '{}'::jsonb)
            from jsonb_each_text(coalesce(a.trophy_name, '{}'::jsonb)) n
            where btrim(coalesce(n.value, '')) <> ''
          )
          else coalesce(a.trophy_name, '{}'::jsonb)
        end
      ) as base_json
    from g_clean g
    join a_clean a
      on (length(g.full_clean) >= 4 and (g.full_clean = a.name_de or g.full_clean = a.name_en))
      or (g.has_dash and length(g.left_en) >= 3 and g.left_en = a.name_en)
      or (g.has_dash and length(g.left_de) >= 3 and g.left_de = a.name_de)
    order by g.guide_row_id, a.platform_achievement_id
  ),
  matched as (
    select
      m.guide_row_id,
      m.neue_trophy_id,
      case
        when v_is_quickwin then
          coalesce(m.base_json, '{}'::jsonb) || coalesce((
            select jsonb_object_agg(loc, fb.val)
            from unnest(v_allowed) as loc
            cross join lateral (
              select coalesce(
                nullif(btrim(m.base_json ->> loc), ''),
                nullif(btrim(m.base_json ->> 'en'), ''),
                nullif(btrim(m.base_json ->> 'de'), '')
              ) as val
            ) fb
            where fb.val is not null
          ), '{}'::jsonb)
        else coalesce(m.base_json, '{}'::jsonb)
      end as gebaute_namen
    from matched_raw m
  )
  update public.game_guides gg
  set
    item_name = coalesce(m.gebaute_namen, '{}'::jsonb) || (
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
      from jsonb_each_text(coalesce(gg.item_name, '{}'::jsonb)) e
      where btrim(coalesce(e.value, '')) <> ''
    ),
    trophy_id = m.neue_trophy_id,
    is_trophy_relevant = 'Ja'
  from matched m
  where gg.id = m.guide_row_id;

  get diagnostics v_updated_b = row_count;
  return v_updated_a + v_updated_b;
end;
$function$;


CREATE OR REPLACE FUNCTION public.tb_apply_stage1_sql_for_game(p_game_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_trophies integer := 0;
  v_glossary integer := 0;
  v_title integer := 0;
  v_zh_rows integer := 0;
  v_game public.games%rowtype;
  v_rows integer := 0;
  v_title_json jsonb;
  v_zh text;
  v_use_title_fallback boolean := false;
  v_allowed text[] := array['de','en','fr','es','it','nl','pt','ru','ja','ko','zh-hans','zh-hant','fi','sv','pl','ar'];
begin
  if not public.tb_is_admin()
     and current_user not in ('postgres', 'supabase_admin', 'service_role')
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') <> 'service_role'
  then
    raise exception 'Keine Admin-Berechtigung.' using errcode = '42501';
  end if;

  if p_game_id is null then
    return 0;
  end if;

  perform set_config('tb.stage1_running', '1', true);

  begin
    v_trophies := public.tb_sync_guide_trophies_for_game(p_game_id);

    with calc as (
      select
        gg.id,
        public.tb_glossary_translate_jsonb(gg.category_group) as new_cat,
        public.tb_glossary_translate_jsonb(gg.chronological_group) as new_chrono,
        public.tb_glossary_translate_jsonb(gg.boss_group) as new_boss,
        public.tb_glossary_translate_jsonb(gg.spiel_region) as new_loc,
        public.tb_glossary_translate_jsonb(gg.item_name) as new_item
      from public.game_guides gg
      where gg.game_id = p_game_id
    )
    update public.game_guides gg
    set
      category_group      = c.new_cat,
      chronological_group = c.new_chrono,
      boss_group          = c.new_boss,
      spiel_region        = c.new_loc,
      item_name           = c.new_item
    from calc c
    where gg.id = c.id
      and (
        gg.category_group      is distinct from c.new_cat
        or gg.chronological_group is distinct from c.new_chrono
        or gg.boss_group          is distinct from c.new_boss
        or gg.spiel_region        is distinct from c.new_loc
        or gg.item_name           is distinct from c.new_item
      );
    get diagnostics v_glossary = row_count;

    select * into v_game from public.games where id = p_game_id;
    if found and jsonb_typeof(v_game.spieltitel) = 'object' then
      select count(*) into v_rows from public.game_guides where game_id = p_game_id;

      select coalesce(jsonb_object_agg(t.key, btrim(t.value)), '{}'::jsonb)
      into v_title_json
      from jsonb_each_text(v_game.spieltitel) t
      where t.key = any(v_allowed) and btrim(coalesce(t.value, '')) <> '';

      v_zh := btrim(coalesce(v_game.spieltitel ->> 'zh', ''));
      if v_zh <> '' then
        if btrim(coalesce(v_title_json ->> 'zh-hans', '')) = '' then
          v_title_json := coalesce(v_title_json, '{}'::jsonb) || jsonb_build_object('zh-hans', v_zh);
        end if;
        if btrim(coalesce(v_title_json ->> 'zh-hant', '')) = '' then
          v_title_json := coalesce(v_title_json, '{}'::jsonb) || jsonb_build_object('zh-hant', v_zh);
        end if;
      end if;

      -- NULL-sicherer Fallback auf spieltitel->>loc -> en -> de über alle 16 Locales
      -- bei Quickwins oder unübersetzt identischem Eigennamen-Titel (z. B. de = en)
      v_use_title_fallback := (
        btrim(coalesce(v_game.spiel_typ, '')) = 'Quickwin'
        or coalesce(v_game.spiel_typ, '') ~* 'Quickwin'
        or (
          nullif(btrim(coalesce(v_game.spieltitel ->> 'de', '')), '') is not null
          and lower(btrim(coalesce(v_game.spieltitel ->> 'de', ''))) = lower(btrim(coalesce(v_game.spieltitel ->> 'en', '')))
        )
      );

      if v_use_title_fallback then
        v_title_json := coalesce(v_title_json, '{}'::jsonb) || coalesce((
          select jsonb_object_agg(loc, fb.val)
          from unnest(v_allowed) as loc
          cross join lateral (
            select coalesce(
              nullif(btrim(v_title_json ->> loc), ''),
              nullif(btrim(v_game.spieltitel ->> loc), ''),
              nullif(btrim(v_game.spieltitel ->> 'en'), ''),
              nullif(btrim(v_game.spieltitel ->> 'de'), '')
            ) as val
          ) fb
          where fb.val is not null
        ), '{}'::jsonb);
      end if;

      if v_title_json <> '{}'::jsonb then
        update public.game_guides gg
        set item_name = coalesce(v_title_json, '{}'::jsonb) || (
          select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
          from jsonb_each_text(coalesce(gg.item_name, '{}'::jsonb)) e
          where btrim(coalesce(e.value, '')) <> ''
        )
        where gg.game_id = p_game_id
          and (
            lower(btrim(coalesce(gg.item_name ->> 'de', ''))) in (select lower(v) from jsonb_each_text(v_title_json) x(k, v))
            or lower(btrim(coalesce(gg.item_name ->> 'en', ''))) in (select lower(v) from jsonb_each_text(v_title_json) x(k, v))
            or (coalesce(v_game.spiel_typ, '') ~* 'Quickwin' and v_rows = 1 and coalesce(btrim(gg.trophy_id), '') = '')
          )
          and exists (
            select 1 from jsonb_each_text(v_title_json) t(k, v)
            where btrim(coalesce(gg.item_name ->> t.k, '')) = ''
          );
        get diagnostics v_title = row_count;
      end if;
    end if;

    v_zh_rows := public.tb_apply_zh_fallback_for_game(p_game_id);
  exception when others then
    perform set_config('tb.stage1_running', '0', true);
    raise;
  end;

  perform set_config('tb.stage1_running', '0', true);

  perform public.tb_auto_release_locales(p_game_id);

  return v_trophies + v_glossary + v_title + v_zh_rows;
end;
$function$;


CREATE OR REPLACE FUNCTION public.tb_check_and_publish_locale(
  p_game_id uuid,
  p_target_lang text,
  p_auto_publish boolean DEFAULT true
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lang text := lower(btrim(coalesce(p_target_lang, '')));
  v_game public.games%rowtype;
  v_source_lang text;
  v_current_status text;
  v_target_status text;
  v_is_quickwin boolean := false;
  v_missing_desc integer := 0;
  v_missing_status_exp integer := 0;
  v_missing_items integer := 0;
  v_missing_chrono integer := 0;
  v_missing_cat integer := 0;
  v_missing_loc integer := 0;
  v_missing_tips integer := 0;
  v_missing_long_tips integer := 0;
  v_total_missing integer := 0;
  v_guide_rows integer := 0;
  v_new_status jsonb;
  v_did_update boolean := false;
begin
  if v_lang = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_target_lang');
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'game_not_found');
  end if;

  -- Quellsprache: de > en > es > pt > jede andere PUBLISHED-Sprache (Admin-Gate)
  v_source_lang := public.tb_source_lang_for_game(v_game.status);
  if v_source_lang is null then
    return jsonb_build_object('ok', false, 'reason', 'not_published_in_any_locale');
  end if;

  -- Asien-exklusive Listen (keine lateinischen de/en-Trophäennamen bzw. asian_only-Flag)
  -- dürfen nicht automatisch in europäische/amerikanische Locales ausgerollt werden.
  if v_lang not in ('ja', 'ko', 'zh-hans', 'zh-hant') then
    if coalesce(v_game.status ->> 'asian_only', '') = 'true'
       or (
         v_source_lang in ('ja', 'ko', 'zh-hans', 'zh-hant')
         and exists (select 1 from public.game_achievements ga where ga.game_id = p_game_id)
         and not exists (
           select 1 from public.game_achievements ga
           where ga.game_id = p_game_id
             and btrim(coalesce(ga.trophy_name ->> 'de', ga.trophy_name ->> 'en', '')) <> ''
         )
       )
    then
      return jsonb_build_object(
        'ok', false,
        'published', false,
        'reason', 'asian_only_trophies',
        'source_lang', v_source_lang,
        'target_lang', v_lang
      );
    end if;
  end if;

  if v_lang = v_source_lang then
    return jsonb_build_object('ok', true, 'published', false, 'reason', 'is_source_lang', 'source_lang', v_source_lang, 'target_lang', v_lang);
  end if;

  v_current_status := upper(coalesce(v_game.status ->> ('guide_' || v_lang), ''));
  if v_current_status = 'PUBLISHED' then
    return jsonb_build_object('ok', true, 'published', false, 'reason', 'already_published', 'source_lang', v_source_lang, 'target_lang', v_lang);
  end if;

  -- Weiche: Sofort-Publish vs. Drip-Feed
  if v_lang in ('de', 'en')
     or v_game.is_indexable is false
     or coalesce(v_game.spiel_typ, '') ~* '(Quickwin|easy_platin|Servertot)' then
    v_target_status := 'PUBLISHED';
  else
    v_target_status := 'READY';
  end if;

  if v_current_status = 'READY' and v_target_status = 'READY' then
    return jsonb_build_object('ok', true, 'published', false, 'reason', 'already_ready', 'source_lang', v_source_lang, 'target_lang', v_lang);
  end if;

  -- Quickwins werden redaktionell nicht übersetzt (Hub & Trophäen nutzen de/en-Fallback).
  v_is_quickwin := (btrim(coalesce(v_game.spiel_typ, '')) = 'Quickwin');

  if not v_is_quickwin then
    if btrim(coalesce(v_game.beschreibung ->> v_source_lang, '')) <> ''
       and btrim(coalesce(v_game.beschreibung ->> v_lang, '')) = '' then
      v_missing_desc := 1;
    end if;

    if btrim(coalesce(v_game.status_explanation_localized ->> v_source_lang, '')) <> ''
       and btrim(coalesce(v_game.status_explanation_localized ->> v_lang, '')) = '' then
      v_missing_status_exp := 1;
    end if;
  end if;

  -- game_guides: 0 Zeilen sind valide (Spiel ohne Schritt-für-Schritt-Guide); dann sind alle Zähler 0
  select
    count(*),
    count(*) filter (
      where btrim(coalesce(item_name ->> v_source_lang, item_name ->> 'de', item_name ->> 'en', '')) <> ''
        and btrim(coalesce(item_name ->> v_lang, '')) = ''
    ),
    count(*) filter (
      where (sheet_type @> '[1]'::jsonb or sheet_type @> '[3]'::jsonb)
        and btrim(coalesce(chronological_group ->> v_source_lang, chronological_group ->> 'de', chronological_group ->> 'en', '')) <> ''
        and btrim(coalesce(chronological_group ->> v_lang, '')) = ''
    ),
    count(*) filter (
      where sheet_type @> '[2]'::jsonb
        and btrim(coalesce(category_group ->> v_source_lang, category_group ->> 'de', category_group ->> 'en', '')) <> ''
        and btrim(coalesce(category_group ->> v_lang, '')) = ''
    ),
    count(*) filter (
      where btrim(coalesce(spiel_region ->> v_source_lang, spiel_region ->> 'de', spiel_region ->> 'en', '')) <> ''
        and btrim(coalesce(spiel_region ->> v_lang, '')) = ''
    )
  into v_guide_rows, v_missing_items, v_missing_chrono, v_missing_cat, v_missing_loc
  from public.game_guides
  where game_id = p_game_id;

  if not v_is_quickwin then
    select
      count(*) filter (
        where btrim(coalesce(guide_tip ->> v_source_lang, '')) <> ''
          and btrim(coalesce(guide_tip ->> v_lang, '')) = ''
      ),
      count(*) filter (
        where btrim(coalesce("Guide-Tip-lang" ->> v_source_lang, '')) <> ''
          and btrim(coalesce("Guide-Tip-lang" ->> v_lang, '')) = ''
      )
    into v_missing_tips, v_missing_long_tips
    from public.game_achievements
    where game_id = p_game_id;
  end if;

  v_total_missing :=
    v_missing_desc + v_missing_status_exp +
    v_missing_items + v_missing_chrono + v_missing_cat + v_missing_loc +
    v_missing_tips + v_missing_long_tips;

  if v_total_missing = 0 and p_auto_publish then
    v_new_status := jsonb_set(
      coalesce(v_game.status, '{}'::jsonb),
      array['guide_' || v_lang],
      to_jsonb(v_target_status),
      true
    );

    -- publishing_status / published_locales werden vom Trigger games_sync_publishing_columns abgeleitet
    update public.games
    set status = v_new_status
    where id = p_game_id;
    v_did_update := true;
  end if;

  return jsonb_build_object(
    'ok', (v_total_missing = 0),
    'published', (v_did_update and v_target_status = 'PUBLISHED'),
    'ready', (v_did_update and v_target_status = 'READY'),
    'target_status', case when v_total_missing = 0 then v_target_status else null end,
    'source_lang', v_source_lang,
    'target_lang', v_lang,
    'guide_rows', v_guide_rows,
    'total_missing', v_total_missing,
    'missing', jsonb_build_object(
      'beschreibung', v_missing_desc,
      'status_explanation', v_missing_status_exp,
      'item_name', v_missing_items,
      'chronological_group', v_missing_chrono,
      'category_group', v_missing_cat,
      'spiel_region', v_missing_loc,
      'guide_tip', v_missing_tips,
      'guide_tip_long', v_missing_long_tips
    )
  );
end;
$function$;

COMMIT;
