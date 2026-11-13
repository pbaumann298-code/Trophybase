-- ============================================================================
-- TrophyBase: Abgesegnete Standard-Chrono-Gruppen (16 Sprachen) &
--             sprachagnostischer Glossar-/Nummern-Übersetzer
-- ============================================================================
-- 1. Ergänzt public.tb_glossary um alle 10 abgesegneten Standard-Chrono-Gruppen
--    aus dem Staging-Editor ("Quick Guide", "Quick Trophy Guide", "Trophy Guides",
--    "100% Achievement Guide", "Platinum Walkthrough", "Achievement Walkthrough",
--    "Einzel-Trophäen & Videos" usw.) inkl. gängiger Creator-Aliase in allen
--    16 unterstützten Locales (inkl. fi, sv, pl, ar, ja, ko, zh-hans, zh-hant).
-- 2. Erweitert public.tb_glossary_translate_jsonb sprachagnostisch (funktioniert
--    für DE, EN, PL, ES, FR, PT, IT, ...) und sonderzeichensicher ("100%", "&",
--    optionale End-Nummern wie "Kapitel 4" oder "Update DLC (2-4)").
-- 3. Erweitert public.tb_translate_numbered_pattern_jsonb um PL/ES/FR/PT/IT-
--    Quellen und Nummerierungsbegriffe (z. B. "Rozdział 1", "Capítulo 2").
-- ============================================================================

BEGIN;

INSERT INTO public.tb_glossary (
  match_de, de, en, fr, es, it, pt, nl, pl, ru, ja, ko, "zh-hans", "zh-hant", fi, sv, ar
)
VALUES
  (
    'quickguide',
    'Kurz-Guide', 'Quick Guide', 'Guide rapide', 'Guía rápida', 'Guida rapida',
    'Guia rápido', 'Snelle gids', 'Szybki poradnik', 'Быстрый гид', 'クイックガイド',
    '퀵 가이드', '快速攻略', '快速攻略', 'Pikaopas', 'Snabbguide', 'دليل سريع'
  ),
  (
    'quicktrophyguide',
    'Schneller Trophäen-Guide', 'Quick Trophy Guide', 'Guide rapide des trophées', 'Guía rápida de trofeos', 'Guida rapida ai trofei',
    'Guia rápido de troféus', 'Snelle trofeeëngids', 'Szybki poradnik trofeów', 'Быстрый гид по трофеям', 'クイックトロフィーガイド',
    '퀵 트로피 가이드', '快速奖杯攻略', '快速獎盃攻略', 'Nopea pokaaliopas', 'Snabb troféguide', 'دليل سريع للكؤوس'
  ),
  (
    'trophyguides',
    'Trophäen-Guides', 'Trophy Guides', 'Guides des trophées', 'Guías de trofeos', 'Guide ai trofei',
    'Guias de troféus', 'Trofeeëngidsen', 'Poradniki trofeów', 'Гиды по трофеям', 'トロフィーガイド',
    '트로피 가이드', '奖杯攻略', '獎盃攻略', 'Pokaalioppaat', 'Troféguider', 'أدلة الكؤوس'
  ),
  (
    '100achievementguide',
    '100% Achievement-Guide', '100% Achievement Guide', 'Guide 100% des succès', 'Guía de logros al 100%', 'Guida obiettivi 100%',
    'Guia 100% de conquistas', '100% Achievement-gids', 'Poradnik 100% osiągnięć', 'Гид на 100% достижений', '100%実績ガイド',
    '100% 도전과제 가이드', '100%成就攻略', '100%成就攻略', '100% saavutusopas', '100% prestationsguide', 'دليل الإنجازات 100%'
  ),
  (
    '100trophyguide',
    '100% Trophäen-Guide', '100% Trophy Guide', 'Guide 100% des trophées', 'Guía de trofeos al 100%', 'Guida trofei 100%',
    'Guia 100% de troféus', '100% Trofeeëngids', 'Poradnik 100% trofeów', 'Гид на 100% трофеев', '100%トロフィーガイド',
    '100% 트로피 가이드', '100%奖杯攻略', '100%獎盃攻略', '100% pokaaliopas', '100% troféguide', 'دليل الكؤوس 100%'
  ),
  (
    '100walkthrough',
    '100% Walkthrough', '100% Walkthrough', 'Soluce 100%', 'Guía completa al 100%', 'Soluzione 100%',
    'Detonado 100%', '100% Walkthrough', 'Solucja 100%', 'Прохождение на 100%', '100%攻略',
    '100% 공략', '100%流程攻略', '100%流程攻略', '100% läpipeluuohje', '100% genomgång', 'تختيم 100%'
  ),
  (
    '100achievementwalkthrough',
    '100% Achievement-Walkthrough', '100% Achievement Walkthrough', 'Soluce 100% des succès', 'Guía paso a paso al 100%', 'Soluzione obiettivi 100%',
    'Guia 100% passo a paso', '100% Achievement-walkthrough', 'Solucja 100% osiągnięć', 'Прохождение на 100% достижений', '100%実績ウォークスルー',
    '100% 도전과제 공략', '100%成就流程攻略', '100%成就流程攻略', '100% saavutusläpipeluu', '100% prestationsgenomgång', 'تختيم الإنجازات 100%'
  ),
  (
    'achievementwalkthrough',
    'Achievement-Walkthrough', 'Achievement Walkthrough', 'Soluce des succès', 'Guía de logros paso a paso', 'Soluzione agli obiettivi',
    'Detonado de conquistas', 'Achievement-walkthrough', 'Solucja osiągnięć', 'Прохождение на достижения', '実績ウォークスルー',
    '도전과제 공략', '成就流程攻略', '成就流程攻略', 'Saavutusläpipeluu', 'Prestationsgenomgång', 'تختيم الإنجازات'
  ),
  (
    'platinumwalkthrough',
    'Platin-Walkthrough', 'Platinum Walkthrough', 'Soluce Platine', 'Guía de Platino', 'Soluzione Platino',
    'Detonado de Platina', 'Platina-walkthrough', 'Solucja Platyny', 'Прохождение на платину', 'プラチナ攻略',
    '플래티넘 공략', '白金流程攻略', '白金流程攻略', 'Platinaläpipeluu', 'Platinagenomgång', 'تختيم البلاتينيوم'
  ),
  (
    'platinwalkthrough',
    'Platin-Walkthrough', 'Platin Walkthrough', 'Soluce Platine', 'Guía de Platino', 'Soluzione Platino',
    'Detonado de Platina', 'Platina-walkthrough', 'Solucja Platyny', 'Прохождение на платину', 'プラチナ攻略',
    '플래티넘 공략', '白金流程攻略', '白金流程攻略', 'Platinaläpipeluu', 'Platinagenomgång', 'تختيم البلاتينيوم'
  ),
  (
    'platinumplaythrough',
    'Platin-Playthrough', 'Platinum Playthrough', 'Partie Platine', 'Partida de Platino', 'Playthrough Platino',
    'Playthrough de Platina', 'Platina-playthrough', 'Przejście na Platynę', 'Прохождение на платину', 'プラチナプレイ',
    '플래티넘 플레이', '白金通关流程', '白金通關流程', 'Platinaläpipeluu', 'Platinagenomspelning', 'لعب البلاتينيوم'
  ),
  (
    'fastplatinum',
    'Schnelle Platin', 'Fast Platinum', 'Platine rapide', 'Platino rápido', 'Platino veloce',
    'Platina rápida', 'Snelle platina', 'Szybka Platyna', 'Быстрая платина', '最速プラチナ',
    '빠른 플래티넘', '快速白金', '快速白金', 'Nopea platina', 'Snabb platina', 'بلاتينيوم سريع'
  ),
  (
    'einzeltrophaeenundvideos',
    'Einzel-Trophäen & Videos', 'Individual Trophies & Videos', 'Trophées individuels & vidéos', 'Trofeos individuales y vídeos', 'Trofei singoli e video',
    'Troféus individuais e vídeos', 'Losse trofeeën & video''s', 'Pojedyncze trofea i filmy', 'Отдельные трофеи и видео', '個別トロフィー＆動画',
    '개별 트로피 및 영상', '单项奖杯与视频', '單項獎盃與影片', 'Yksittäiset pokaalit ja videot', 'Enskilda troféer & videor', 'الكؤوس الفردية والفيديوهات'
  ),
  (
    'einzeltrophaeen',
    'Einzel-Trophäen', 'Individual Trophies', 'Trophées individuels', 'Trofeos individuales', 'Trofei singoli',
    'Troféus individuais', 'Losse trofeeën', 'Pojedyncze trofea', 'Отдельные трофеи', '個別トロフィー',
    '개별 트로피', '单项奖杯', '單項獎盃', 'Yksittäiset pokaalit', 'Enskilda troféer', 'الكؤوس الفردية'
  ),
  (
    'quicktrophyachievementguide',
    'Schneller Trophäen- & Achievement-Guide', 'Quick Trophy & Achievement Guide', 'Guide rapide trophées & succès', 'Guía rápida de trofeos y logros', 'Guida rapida trofei e obiettivi',
    'Guia rápido de troféus e conquistas', 'Snelle trofeeën- & achievementgids', 'Szybki poradnik trofeów i osiągnięć', 'Быстрый гид по трофеям и достижениям', 'クイックトロフィー＆実績ガイド',
    '퀵 트로피 및 도전과제 가이드', '快速奖杯与成就攻略', '快速獎盃與成就攻略', 'Nopea pokaali- ja saavutusopas', 'Snabb trofé- & prestationsguide', 'دليل سريع للكؤوس والإنجازات'
  ),
  (
    'clicktrophyguide',
    'Klick-Trophäen-Guide', 'Click Trophy Guide', 'Guide des trophées clic', 'Guía de trofeos de clic', 'Guida ai trofei click',
    'Guia de troféus de clique', 'Klik-trofeeëngids', 'Poradnik trofeów klikania', 'Гид по клик-трофеям', 'クリックトロフィーガイド',
    '클릭 트로피 가이드', '点击奖杯攻略', '點擊獎盃攻略', 'Klikkauspokaaliopas', 'Klick-troféguide', 'دليل كؤوس النقر'
  ),
  (
    'bonuschapter',
    'Bonuskapitel', 'Bonus Chapter', 'Chapitre bonus', 'Capítulo extra', 'Capitolo bonus',
    'Capítulo bônus', 'Bonushoofdstuk', 'Rozdział bonusowy', 'Бонусная глава', 'ボーナスチャプター',
    '보너스 챕터', '奖励章节', '獎勵章節', 'Bonusluku', 'Bonuskapitel', 'فصل إضافي'
  ),
  (
    'updatedlc',
    'Update-DLC', 'Update DLC', 'Mise à jour DLC', 'Actualización DLC', 'Aggiornamento DLC',
    'Atualização DLC', 'Update-DLC', 'Aktualizacja DLC', 'Обновление DLC', 'アップデートDLC',
    '업데이트 DLC', '更新DLC', '更新DLC', 'Päivitys-DLC', 'Uppdaterings-DLC', 'تحديث DLC'
  ),
  (
    'allbossesending',
    'Alle Bosse & Ende', 'All Bosses & Ending', 'Tous les boss & fin', 'Todos los jefes y final', 'Tutti i boss e finale',
    'Todos os chefes e final', 'Alle bazen & einde', 'Wszyscy bossowie i zakończenie', 'Все боссы и концовка', '全ボス＆エンディング',
    '모든 보스 및 엔딩', '全Boss与结局', '全Boss與結局', 'Kaikki pomot ja loppu', 'Alla bossar & slut', 'جميع الزعماء والنهاية'
  ),
  (
    'gameplaypreview',
    'Gameplay-Vorschau', 'Gameplay Preview', 'Aperçu du gameplay', 'Vista previa de jugabilidad', 'Anteprima gameplay',
    'Prévia de gameplay', 'Gameplay-preview', 'Podgląd rozgrywki', 'Превью геймплея', 'ゲームプレイプレビュー',
    '게임플레이 미리보기', '实机演示预览', '實機演示預覽', 'Pelikuvan esikatselu', 'Gameplay-förhandsvisning', 'معاينة أسلوب اللعب'
  ),
  (
    'preview',
    'Vorschau', 'Preview', 'Aperçu', 'Vista previa', 'Anteprima',
    'Prévia', 'Preview', 'Podgląd', 'Превью', 'プレビュー',
    '미리보기', '预览', '預覽', 'Esikatselu', 'Förhandsvisning', 'معاينة'
  ),
  (
    'previewandgameplay',
    'Vorschau & Gameplay', 'Preview and Gameplay', 'Aperçu & gameplay', 'Vista previa y jugabilidad', 'Anteprima e gameplay',
    'Prévia e gameplay', 'Preview & gameplay', 'Podgląd i rozgrywka', 'Превью и геймплей', 'プレビュー＆ゲームプレイ',
    '미리보기 및 게임플레이', '预览与实机演示', '預覽與實機演示', 'Esikatselu ja pelikuva', 'Förhandsvisning & gameplay', 'معاينة وأسلوب اللعب'
  )
ON CONFLICT (match_de) DO UPDATE SET
  de = EXCLUDED.de,
  en = EXCLUDED.en,
  fr = EXCLUDED.fr,
  es = EXCLUDED.es,
  it = EXCLUDED.it,
  pt = EXCLUDED.pt,
  nl = EXCLUDED.nl,
  pl = EXCLUDED.pl,
  ru = EXCLUDED.ru,
  ja = EXCLUDED.ja,
  ko = EXCLUDED.ko,
  "zh-hans" = EXCLUDED."zh-hans",
  "zh-hant" = EXCLUDED."zh-hant",
  fi = EXCLUDED.fi,
  sv = EXCLUDED.sv,
  ar = EXCLUDED.ar;

CREATE OR REPLACE FUNCTION public.tb_glossary_translate_jsonb(p_val jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
declare
  v_candidates text[];
  v_raw text;
  v_base text;
  v_suffix text := '';
  v_norm text;
  v_row public.tb_glossary%rowtype;
  v_found boolean := false;
  v_out jsonb := coalesce(p_val, '{}'::jsonb);
  v_k text;
  v_v text;
begin
  if p_val is null or jsonb_typeof(p_val) <> 'object' then
    return p_val;
  end if;

  select array_agg(val order by ord)
  into v_candidates
  from (
    select distinct on (lower(btrim(e.value)))
      btrim(e.value) as val,
      coalesce(array_position(array['de','en','pl','es','fr','pt','it','nl','ru','sv','fi'], e.key), 99) as ord
    from jsonb_each_text(p_val) e
    where btrim(coalesce(e.value, '')) <> ''
    order by lower(btrim(e.value)), coalesce(array_position(array['de','en','pl','es','fr','pt','it','nl','ru','sv','fi'], e.key), 99)
  ) sub;

  if v_candidates is null or array_length(v_candidates, 1) is null then
    return v_out;
  end if;

  foreach v_raw in array v_candidates loop
    v_suffix := '';
    v_base := v_raw;

    if v_raw ~ '^(.+?[A-Za-zÄÖÜäöüß])(\s+(?:[#:\-–]?\s*\d+[\d\.\-\/]*|\(\d+[\d\.\-\/]*\)))\Z' then
      v_base := regexp_replace(v_raw, '^(.+?[A-Za-zÄÖÜäöüß])(\s+(?:[#:\-–]?\s*\d+[\d\.\-\/]*|\(\d+[\d\.\-\/]*\)))\Z', '\1');
      v_suffix := substring(v_raw from length(v_base) + 1);
    end if;

    v_norm := lower(btrim(v_base));
    v_norm := replace(replace(replace(replace(v_norm, 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss');
    v_norm := replace(v_norm, '+', 'plus');
    v_norm := regexp_replace(v_norm, '[^a-z0-9]+', '', 'g');

    if v_norm = '' then
      continue;
    end if;

    select *
    into v_row
    from public.tb_glossary g
    where g.match_de = v_norm
       or regexp_replace(replace(lower(coalesce(g.en, '')), '+', 'plus'), '[^a-z0-9]+', '', 'g') = v_norm
       or lower(btrim(coalesce(g.de, ''))) = lower(btrim(v_base))
       or lower(btrim(coalesce(g.en, ''))) = lower(btrim(v_base))
       or lower(btrim(coalesce(g.pl, ''))) = lower(btrim(v_base))
       or lower(btrim(coalesce(g.es, ''))) = lower(btrim(v_base))
       or lower(btrim(coalesce(g.fr, ''))) = lower(btrim(v_base))
       or lower(btrim(coalesce(g.pt, ''))) = lower(btrim(v_base))
       or lower(btrim(coalesce(g.it, ''))) = lower(btrim(v_base))
    order by (g.match_de = v_norm) desc
    limit 1;

    if found then
      v_found := true;
      exit;
    end if;
  end loop;

  if not v_found then
    return v_out;
  end if;

  for v_k, v_v in
    select key, value from jsonb_each_text(to_jsonb(v_row) - 'match_de')
  loop
    if v_v is null or btrim(v_v) = '' then
      continue;
    end if;
    if btrim(coalesce(v_out ->> v_k, '')) = '' then
      v_out := v_out || jsonb_build_object(v_k, v_v || v_suffix);
    end if;
  end loop;

  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tb_translate_numbered_pattern_jsonb(p_val jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
declare
  v_src text;
  v_match text[];
  v_word text;
  v_num text;
  v_result jsonb;
  v_templates jsonb;
begin
  if p_val is null or jsonb_typeof(p_val) <> 'object' then
    return p_val;
  end if;

  v_src := coalesce(
    nullif(btrim(p_val ->> 'de'), ''),
    nullif(btrim(p_val ->> 'en'), ''),
    nullif(btrim(p_val ->> 'pl'), ''),
    nullif(btrim(p_val ->> 'es'), ''),
    nullif(btrim(p_val ->> 'pt'), ''),
    nullif(btrim(p_val ->> 'fr'), ''),
    nullif(btrim(p_val ->> 'it'), ''),
    (select btrim(value) from jsonb_each_text(p_val) where btrim(coalesce(value, '')) <> '' limit 1)
  );

  if v_src is null then
    return p_val;
  end if;

  v_match := regexp_match(
    v_src,
    '^\s*(level|lvl|poziom|nivel|nível|niveau|livello|stage|etap|etapa|étape|chapter|kapitel|rozdział|rozdzial|capítulo|capitulo|chapitre|capitolo|part|teil|część|czesc|parte|partie|act|akt|acto|ato|acte|atto|world|welt|świat|swiat|mundo|monde|mondo|wave|welle|fala|oleada|onda|vague|ondata|round|runde|runda|ronda|rodada|manche|mission|misja|misión|mision|missão|missao|missione|room|raum|pokój|pokoj|sala|salle|stanza|puzzle|rätsel|raetsel|zagadka|puzle|énigme|enigme|enigma|day|tag|dzień|dzien|día|dia|jour|giorno|area|gebiet|obszar|área|zone|zona|strefa|floor|etage|ebene|piętro|pietro|piso|andar|étage|piano|phase|faza|fase|step|schritt|krok|paso|passo|boss|jefe|chefe|baas)\s*[#:\-–—]?\s*(\d+(?:[\-–—\./]\d+)?)\s*$',
    'i'
  );

  if v_match is null then
    return p_val;
  end if;

  v_word := lower(v_match[1]);
  v_num  := v_match[2];

  v_templates := case
    when v_word in ('level', 'lvl', 'poziom', 'nivel', 'nível', 'niveau', 'livello') then jsonb_build_object(
      'de', 'Level ' || v_num, 'en', 'Level ' || v_num, 'fr', 'Niveau ' || v_num,
      'es', 'Nivel ' || v_num, 'it', 'Livello ' || v_num, 'nl', 'Level ' || v_num,
      'pt', 'Nível ' || v_num, 'pl', 'Poziom ' || v_num, 'ru', 'Уровень ' || v_num,
      'sv', 'Nivå ' || v_num, 'fi', 'Taso ' || v_num, 'ar', 'المستوى ' || v_num,
      'ja', 'レベル ' || v_num, 'ko', '레벨 ' || v_num,
      'zh-hans', '第 ' || v_num || ' 关', 'zh-hant', '第 ' || v_num || ' 關'
    )
    when v_word in ('stage', 'etap', 'etapa', 'étape') then jsonb_build_object(
      'de', 'Stage ' || v_num, 'en', 'Stage ' || v_num, 'fr', 'Étape ' || v_num,
      'es', 'Etapa ' || v_num, 'it', 'Fase ' || v_num, 'nl', 'Stage ' || v_num,
      'pt', 'Fase ' || v_num, 'pl', 'Etap ' || v_num, 'ru', 'Этап ' || v_num,
      'sv', 'Bana ' || v_num, 'fi', 'Kenttä ' || v_num, 'ar', 'المرحلة ' || v_num,
      'ja', 'ステージ ' || v_num, 'ko', '스테이지 ' || v_num,
      'zh-hans', '第 ' || v_num || ' 关', 'zh-hant', '第 ' || v_num || ' 關'
    )
    when v_word in ('chapter', 'kapitel', 'rozdział', 'rozdzial', 'capítulo', 'capitulo', 'chapitre', 'capitolo') then jsonb_build_object(
      'de', 'Kapitel ' || v_num, 'en', 'Chapter ' || v_num, 'fr', 'Chapitre ' || v_num,
      'es', 'Capítulo ' || v_num, 'it', 'Capitolo ' || v_num, 'nl', 'Hoofdstuk ' || v_num,
      'pt', 'Capítulo ' || v_num, 'pl', 'Rozdział ' || v_num, 'ru', 'Глава ' || v_num,
      'sv', 'Kapitel ' || v_num, 'fi', 'Luku ' || v_num, 'ar', 'الفصل ' || v_num,
      'ja', 'チャプター ' || v_num, 'ko', '챕터 ' || v_num,
      'zh-hans', '第 ' || v_num || ' 章', 'zh-hant', '第 ' || v_num || ' 章'
    )
    when v_word in ('part', 'teil', 'część', 'czesc', 'parte', 'partie') then jsonb_build_object(
      'de', 'Teil ' || v_num, 'en', 'Part ' || v_num, 'fr', 'Partie ' || v_num,
      'es', 'Parte ' || v_num, 'it', 'Parte ' || v_num, 'nl', 'Deel ' || v_num,
      'pt', 'Parte ' || v_num, 'pl', 'Część ' || v_num, 'ru', 'Часть ' || v_num,
      'sv', 'Del ' || v_num, 'fi', 'Osa ' || v_num, 'ar', 'الجزء ' || v_num,
      'ja', 'パート ' || v_num, 'ko', '파트 ' || v_num,
      'zh-hans', '第 ' || v_num || ' 部分', 'zh-hant', '第 ' || v_num || ' 部分'
    )
    when v_word in ('act', 'akt', 'acto', 'ato', 'acte', 'atto') then jsonb_build_object(
      'de', 'Akt ' || v_num, 'en', 'Act ' || v_num, 'fr', 'Acte ' || v_num,
      'es', 'Acto ' || v_num, 'it', 'Atto ' || v_num, 'nl', 'Akte ' || v_num,
      'pt', 'Ato ' || v_num, 'pl', 'Akt ' || v_num, 'ru', 'Акт ' || v_num,
      'sv', 'Akt ' || v_num, 'fi', 'Näytös ' || v_num, 'ar', 'الفصل ' || v_num,
      'ja', 'アクト ' || v_num, 'ko', '액트 ' || v_num,
      'zh-hans', '第 ' || v_num || ' 幕', 'zh-hant', '第 ' || v_num || ' 幕'
    )
    when v_word in ('world', 'welt', 'świat', 'swiat', 'mundo', 'monde', 'mondo') then jsonb_build_object(
      'de', 'Welt ' || v_num, 'en', 'World ' || v_num, 'fr', 'Monde ' || v_num,
      'es', 'Mundo ' || v_num, 'it', 'Mondo ' || v_num, 'nl', 'Wereld ' || v_num,
      'pt', 'Mundo ' || v_num, 'pl', 'Świat ' || v_num, 'ru', 'Мир ' || v_num,
      'sv', 'Värld ' || v_num, 'fi', 'Maailma ' || v_num, 'ar', 'العالم ' || v_num,
      'ja', 'ワールド ' || v_num, 'ko', '월드 ' || v_num,
      'zh-hans', '世界 ' || v_num, 'zh-hant', '世界 ' || v_num
    )
    when v_word in ('wave', 'welle', 'fala', 'oleada', 'onda', 'vague', 'ondata') then jsonb_build_object(
      'de', 'Welle ' || v_num, 'en', 'Wave ' || v_num, 'fr', 'Vague ' || v_num,
      'es', 'Oleada ' || v_num, 'it', 'Ondata ' || v_num, 'nl', 'Golf ' || v_num,
      'pt', 'Onda ' || v_num, 'pl', 'Fala ' || v_num, 'ru', 'Волна ' || v_num,
      'sv', 'Våg ' || v_num, 'fi', 'Aalto ' || v_num, 'ar', 'الموجة ' || v_num,
      'ja', 'ウェーブ ' || v_num, 'ko', '웨이브 ' || v_num,
      'zh-hans', '第 ' || v_num || ' 波', 'zh-hant', '第 ' || v_num || ' 波'
    )
    when v_word in ('round', 'runde', 'runda', 'ronda', 'rodada', 'manche') then jsonb_build_object(
      'de', 'Runde ' || v_num, 'en', 'Round ' || v_num, 'fr', 'Manche ' || v_num,
      'es', 'Ronda ' || v_num, 'it', 'Round ' || v_num, 'nl', 'Ronde ' || v_num,
      'pt', 'Rodada ' || v_num, 'pl', 'Runda ' || v_num, 'ru', 'Раунд ' || v_num,
      'sv', 'Runda ' || v_num, 'fi', 'Erä ' || v_num, 'ar', 'الجولة ' || v_num,
      'ja', 'ラウンド ' || v_num, 'ko', '라운드 ' || v_num,
      'zh-hans', '第 ' || v_num || ' 回合', 'zh-hant', '第 ' || v_num || ' 回合'
    )
    when v_word in ('mission', 'misja', 'misión', 'mision', 'missão', 'missao', 'missione') then jsonb_build_object(
      'de', 'Mission ' || v_num, 'en', 'Mission ' || v_num, 'fr', 'Mission ' || v_num,
      'es', 'Misión ' || v_num, 'it', 'Missione ' || v_num, 'nl', 'Missie ' || v_num,
      'pt', 'Missão ' || v_num, 'pl', 'Misja ' || v_num, 'ru', 'Миссия ' || v_num,
      'sv', 'Uppdrag ' || v_num, 'fi', 'Tehtävä ' || v_num, 'ar', 'المهمة ' || v_num,
      'ja', 'ミッション ' || v_num, 'ko', '미션 ' || v_num,
      'zh-hans', '任务 ' || v_num, 'zh-hant', '任務 ' || v_num
    )
    when v_word in ('room', 'raum', 'pokój', 'pokoj', 'sala', 'salle', 'stanza') then jsonb_build_object(
      'de', 'Raum ' || v_num, 'en', 'Room ' || v_num, 'fr', 'Salle ' || v_num,
      'es', 'Sala ' || v_num, 'it', 'Stanza ' || v_num, 'nl', 'Kamer ' || v_num,
      'pt', 'Sala ' || v_num, 'pl', 'Pokój ' || v_num, 'ru', 'Комната ' || v_num,
      'sv', 'Rum ' || v_num, 'fi', 'Huone ' || v_num, 'ar', 'الغرفة ' || v_num,
      'ja', 'ルーム ' || v_num, 'ko', '방 ' || v_num,
      'zh-hans', '房间 ' || v_num, 'zh-hant', '房間 ' || v_num
    )
    when v_word in ('puzzle', 'rätsel', 'raetsel', 'zagadka', 'puzle', 'énigme', 'enigme', 'enigma') then jsonb_build_object(
      'de', 'Rätsel ' || v_num, 'en', 'Puzzle ' || v_num, 'fr', 'Énigme ' || v_num,
      'es', 'Puzle ' || v_num, 'it', 'Enigma ' || v_num, 'nl', 'Puzzel ' || v_num,
      'pt', 'Quebra-cabeça ' || v_num, 'pl', 'Zagadka ' || v_num, 'ru', 'Головоломка ' || v_num,
      'sv', 'Pussel ' || v_num, 'fi', 'Pulma ' || v_num, 'ar', 'اللغز ' || v_num,
      'ja', 'パズル ' || v_num, 'ko', '퍼즐 ' || v_num,
      'zh-hans', '谜题 ' || v_num, 'zh-hant', '謎題 ' || v_num
    )
    when v_word in ('day', 'tag', 'dzień', 'dzien', 'día', 'dia', 'jour', 'giorno') then jsonb_build_object(
      'de', 'Tag ' || v_num, 'en', 'Day ' || v_num, 'fr', 'Jour ' || v_num,
      'es', 'Día ' || v_num, 'it', 'Giorno ' || v_num, 'nl', 'Dag ' || v_num,
      'pt', 'Dia ' || v_num, 'pl', 'Dzień ' || v_num, 'ru', 'День ' || v_num,
      'sv', 'Dag ' || v_num, 'fi', 'Päivä ' || v_num, 'ar', 'اليوم ' || v_num,
      'ja', v_num || '日目', 'ko', v_num || '일차',
      'zh-hans', '第 ' || v_num || ' 天', 'zh-hant', '第 ' || v_num || ' 天'
    )
    when v_word in ('area', 'gebiet', 'obszar', 'área') then jsonb_build_object(
      'de', 'Gebiet ' || v_num, 'en', 'Area ' || v_num, 'fr', 'Zone ' || v_num,
      'es', 'Área ' || v_num, 'it', 'Area ' || v_num, 'nl', 'Gebied ' || v_num,
      'pt', 'Área ' || v_num, 'pl', 'Obszar ' || v_num, 'ru', 'Зона ' || v_num,
      'sv', 'Område ' || v_num, 'fi', 'Alue ' || v_num, 'ar', 'المنطقة ' || v_num,
      'ja', 'エリア ' || v_num, 'ko', '구역 ' || v_num,
      'zh-hans', '区域 ' || v_num, 'zh-hant', '區域 ' || v_num
    )
    when v_word in ('floor', 'etage', 'ebene', 'piętro', 'pietro', 'piso', 'andar', 'étage', 'piano') then jsonb_build_object(
      'de', 'Ebene ' || v_num, 'en', 'Floor ' || v_num, 'fr', 'Étage ' || v_num,
      'es', 'Piso ' || v_num, 'it', 'Piano ' || v_num, 'nl', 'Verdieping ' || v_num,
      'pt', 'Andar ' || v_num, 'pl', 'Piętro ' || v_num, 'ru', 'Этаж ' || v_num,
      'sv', 'Våning ' || v_num, 'fi', 'Kerros ' || v_num, 'ar', 'الطابق ' || v_num,
      'ja', 'フロア ' || v_num, 'ko', v_num || '층',
      'zh-hans', '第 ' || v_num || ' 层', 'zh-hant', '第 ' || v_num || ' 層'
    )
    when v_word in ('zone', 'zona', 'strefa') then jsonb_build_object(
      'de', 'Zone ' || v_num, 'en', 'Zone ' || v_num, 'fr', 'Zone ' || v_num,
      'es', 'Zona ' || v_num, 'it', 'Zona ' || v_num, 'nl', 'Zone ' || v_num,
      'pt', 'Zona ' || v_num, 'pl', 'Strefa ' || v_num, 'ru', 'Зона ' || v_num,
      'sv', 'Zon ' || v_num, 'fi', 'Vyöhyke ' || v_num, 'ar', 'المنطقة ' || v_num,
      'ja', 'ゾーン ' || v_num, 'ko', '존 ' || v_num,
      'zh-hans', '区域 ' || v_num, 'zh-hant', '區域 ' || v_num
    )
    when v_word in ('phase', 'faza', 'fase') then jsonb_build_object(
      'de', 'Phase ' || v_num, 'en', 'Phase ' || v_num, 'fr', 'Phase ' || v_num,
      'es', 'Fase ' || v_num, 'it', 'Fase ' || v_num, 'nl', 'Fase ' || v_num,
      'pt', 'Fase ' || v_num, 'pl', 'Faza ' || v_num, 'ru', 'Фаза ' || v_num,
      'sv', 'Fas ' || v_num, 'fi', 'Vaihe ' || v_num, 'ar', 'المرحلة ' || v_num,
      'ja', 'フェーズ ' || v_num, 'ko', '페이즈 ' || v_num,
      'zh-hans', '第 ' || v_num || ' 阶段', 'zh-hant', '第 ' || v_num || ' 階段'
    )
    when v_word in ('step', 'schritt', 'krok', 'paso', 'passo') then jsonb_build_object(
      'de', 'Schritt ' || v_num, 'en', 'Step ' || v_num, 'fr', 'Étape ' || v_num,
      'es', 'Paso ' || v_num, 'it', 'Passo ' || v_num, 'nl', 'Stap ' || v_num,
      'pt', 'Passo ' || v_num, 'pl', 'Krok ' || v_num, 'ru', 'Шаг ' || v_num,
      'sv', 'Steg ' || v_num, 'fi', 'Vaihe ' || v_num, 'ar', 'الخطوة ' || v_num,
      'ja', 'ステップ ' || v_num, 'ko', '단계 ' || v_num,
      'zh-hans', '步骤 ' || v_num, 'zh-hant', '步驟 ' || v_num
    )
    when v_word in ('boss', 'jefe', 'chefe', 'baas') then jsonb_build_object(
      'de', 'Boss ' || v_num, 'en', 'Boss ' || v_num, 'fr', 'Boss ' || v_num,
      'es', 'Jefe ' || v_num, 'it', 'Boss ' || v_num, 'nl', 'Baas ' || v_num,
      'pt', 'Chefe ' || v_num, 'pl', 'Boss ' || v_num, 'ru', 'Босс ' || v_num,
      'sv', 'Boss ' || v_num, 'fi', 'Pomo ' || v_num, 'ar', 'الزعيم ' || v_num,
      'ja', 'ボス ' || v_num, 'ko', '보스 ' || v_num,
      'zh-hans', 'Boss ' || v_num, 'zh-hant', 'Boss ' || v_num
    )
    else null
  end;

  if v_templates is null then
    return p_val;
  end if;

  v_result := v_templates || (
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    from jsonb_each_text(p_val) as x(k, v)
    where btrim(coalesce(v, '')) <> ''
  );

  return v_result;
end;
$function$;

COMMIT;
