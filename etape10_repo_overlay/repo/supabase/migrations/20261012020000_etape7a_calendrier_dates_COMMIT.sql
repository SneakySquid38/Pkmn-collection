-- =============================================================================
-- Étape 7a : calendrier des sorties de sets et dates des sets asiatiques
-- Projet : Pkmn-collection — 2026-10-12
--
-- Idée : les dates de sortie vivent dans une table de référence à part, `set_calendar`
-- (une ligne par langue + code de set), reliée aux sets par (language, code).
-- On peut y ajouter des lignes à la main à tout moment, puis relancer
-- `select public.apply_set_calendar();`.
--
-- Sources des 310 lignes de départ :
--   tcgdex            : définitions de sets et données de cartes TCGdex (date du set, ou date
--                       de sortie dans la langue du set quand TCGdex la donne : coréen, chinois TC)
--   tcgdex_crosswalk  : set ptcg-database sans équivalent de code chez TCGdex mais dont la sortie est
--                       identique à celle d'un set TCGdex (ex. BW1-Bb / BW1-Bw = BW1a / BW1b, 2010-12-17 ;
--                       DPt1-B = Pt1 ; BW10-B = EBB)
--   tcgcollector      : page publique « Sets » de TCGCollector, 35 decks et coffrets récents absents de TCGdex
--
-- apply_set_calendar() remplit sets.release_date, dans cet ordre de priorité :
--   1. une date saisie à la main (release_date_source = 'manual') n'est jamais modifiée ;
--   2. la date du calendrier pour la langue et le code du set ;
--   3. pour un set KR / TC / SC sans date : la date du set JP aligné (set_alignments),
--      marquée release_date_source = 'jp_aligned' (date approximative : ordre et année).
-- Les dates déjà présentes (sets FR et SC) reçoivent release_date_source = 'import'.
-- Restent sans date : decks, coffrets et promos anciens sans source (voir le rapport).
--
-- Annulation : update public.sets set release_date = null where release_date_source in
--   ('tcgdex','tcgdex_crosswalk','tcgcollector','jp_aligned');
--   drop table public.set_calendar; drop function public.apply_set_calendar();
--
-- VERSION COMMIT : les modifications sont enregistrées (dernière ligne « commit »).
-- Test à blanc validé : 496 sets modifiés, 0 set daté sans source.
-- =============================================================================

begin;
set local statement_timeout = '15min';

alter table public.sets add column if not exists release_date_source text;
comment on column public.sets.release_date_source is
  'Origine de release_date : import, tcgdex, tcgdex_crosswalk, tcgcollector, jp_aligned (approximative), manual.';

create table if not exists public.set_calendar (
  language text not null check (language in ('FR','JP','KR','TC','SC')),
  code text not null,
  release_date date not null,
  source text not null,
  note text,
  primary key (language, code)
);
alter table public.set_calendar enable row level security;

insert into public.set_calendar (language, code, release_date, source, note) values
  ('JP','ADV1',date '2003-01-31','tcgdex',''),
  ('JP','ADV2',date '2003-04-18','tcgdex',''),
  ('JP','ADV3',date '2003-06-25','tcgdex',''),
  ('JP','ADV4',date '2003-10-24','tcgdex',''),
  ('JP','ADV5',date '2004-01-16','tcgdex',''),
  ('JP','BW1-Bb',date '2010-12-17','tcgdex_crosswalk','équivalent TCGdex : BW1a/BW1b'),
  ('JP','BW1-Bw',date '2010-12-17','tcgdex_crosswalk','équivalent TCGdex : BW1a/BW1b'),
  ('JP','BW10-B',date '2013-07-13','tcgdex_crosswalk','équivalent TCGdex : EBB'),
  ('JP','BW2-B',date '2011-07-15','tcgdex_crosswalk','équivalent TCGdex : BW2'),
  ('JP','BW3-Bh',date '2011-09-16','tcgdex_crosswalk','équivalent TCGdex : BW3a'),
  ('JP','BW3-Bp',date '2011-09-16','tcgdex_crosswalk','équivalent TCGdex : BW3a'),
  ('JP','BW4-B',date '2011-12-16','tcgdex_crosswalk','équivalent TCGdex : BW4'),
  ('JP','BW5-Brn',date '2012-03-16','tcgdex_crosswalk','équivalent TCGdex : BW5a/BW5b'),
  ('JP','BW5-Brz',date '2012-03-16','tcgdex_crosswalk','équivalent TCGdex : BW5a/BW5b'),
  ('JP','BW6-Bc',date '2012-07-13','tcgdex_crosswalk','équivalent TCGdex : BW6a/BW6b'),
  ('JP','BW6-Bf',date '2012-07-13','tcgdex_crosswalk','équivalent TCGdex : BW6a/BW6b'),
  ('JP','BW7-B',date '2012-09-14','tcgdex_crosswalk','équivalent TCGdex : BW7'),
  ('JP','BW8-Brf',date '2012-12-14','tcgdex_crosswalk','équivalent TCGdex : BW8a'),
  ('JP','BW8-Brn',date '2012-12-14','tcgdex_crosswalk','équivalent TCGdex : BW8a'),
  ('JP','BW9-B',date '2013-03-15','tcgdex_crosswalk','équivalent TCGdex : BW9'),
  ('JP','CLF',date '2023-10-31','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','CLK',date '2023-10-31','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','CLL',date '2023-10-31','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','CP1',date '2015-01-30','tcgdex',''),
  ('JP','CP2',date '2015-07-18','tcgdex',''),
  ('JP','CP3',date '2016-01-29','tcgdex',''),
  ('JP','CP4',date '2016-04-16','tcgdex',''),
  ('JP','CP5',date '2016-07-16','tcgdex',''),
  ('JP','CP6',date '2016-09-16','tcgdex',''),
  ('JP','DP1',date '2006-11-30','tcgdex_crosswalk','équivalent TCGdex : DP1a/DP1b'),
  ('JP','DP2',date '2007-03-02','tcgdex',''),
  ('JP','DP3',date '2007-07-05','tcgdex',''),
  ('JP','DP4',date '2007-10-26','tcgdex_crosswalk','équivalent TCGdex : DP4a/DP4b'),
  ('JP','DP5',date '2008-03-14','tcgdex_crosswalk','équivalent TCGdex : DP5a/DP5b'),
  ('JP','DPs-B',date '2008-07-10','tcgdex_crosswalk','équivalent TCGdex : DP6'),
  ('JP','DPt1-B',date '2008-10-10','tcgdex_crosswalk','équivalent TCGdex : Pt1'),
  ('JP','DPt2-B',date '2008-12-26','tcgdex_crosswalk','équivalent TCGdex : Pt2'),
  ('JP','DPt3-B',date '2009-03-06','tcgdex_crosswalk','équivalent TCGdex : Pt3'),
  ('JP','DPt4-B',date '2009-07-08','tcgdex_crosswalk','équivalent TCGdex : Pt4'),
  ('JP','DS',date '2012-01-27','tcgdex',''),
  ('JP','E1',date '2001-12-01','tcgdex',''),
  ('JP','E2',date '2002-03-08','tcgdex',''),
  ('JP','E3',date '2002-05-24','tcgdex',''),
  ('JP','E4',date '2002-08-23','tcgdex',''),
  ('JP','E5',date '2002-10-04','tcgdex',''),
  ('JP','L1a',date '2009-10-09','tcgdex',''),
  ('JP','L1b',date '2009-10-09','tcgdex',''),
  ('JP','L2',date '2010-02-11','tcgdex',''),
  ('JP','L3',date '2010-07-08','tcgdex',''),
  ('JP','LL',date '2010-04-16','tcgdex',''),
  ('JP','M-P',date '2025-07-28','tcgdex',''),
  ('JP','M1L',date '2025-08-01','tcgdex',''),
  ('JP','M1S',date '2025-08-01','tcgdex',''),
  ('JP','M2',date '2025-09-26','tcgdex',''),
  ('JP','M2a',date '2025-11-28','tcgdex',''),
  ('JP','M3',date '2026-01-23','tcgdex',''),
  ('JP','M4',date '2026-03-13','tcgdex',''),
  ('JP','M5',date '2026-05-22','tcgdex',''),
  ('JP','M6',date '2026-07-31','tcgdex',''),
  ('JP','M6a',date '2026-09-16','tcgdex',''),
  ('JP','MA',date '2025-08-01','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','MBD',date '2025-09-05','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','MBG',date '2025-09-05','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','MC',date '2025-12-19','tcgdex',''),
  ('JP','MEE',date '2026-07-31','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','MEM',date '2026-07-31','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','MEZ',date '2026-07-31','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','MF',date '2026-09-16','tcgdex',''),
  ('JP','MP1',date '2025-12-19','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','neo1',date '2000-02-04','tcgdex',''),
  ('JP','neo2',date '2000-07-07','tcgdex',''),
  ('JP','neo3',date '2000-11-23','tcgdex',''),
  ('JP','neo4',date '2001-04-20','tcgdex',''),
  ('JP','PCG1',date '2004-04-09','tcgdex',''),
  ('JP','PCG2',date '2004-07-01','tcgdex',''),
  ('JP','PCG3',date '2004-10-15','tcgdex',''),
  ('JP','PCG4',date '2005-04-08','tcgdex',''),
  ('JP','PCG5',date '2005-06-30','tcgdex',''),
  ('JP','PCG6',date '2005-10-28','tcgdex',''),
  ('JP','PCG7',date '2006-01-27','tcgdex',''),
  ('JP','PCG8',date '2006-03-10','tcgdex',''),
  ('JP','PCG9',date '2006-06-29','tcgdex',''),
  ('JP','PMCG1',date '1996-10-20','tcgdex',''),
  ('JP','PMCG2',date '1997-03-05','tcgdex',''),
  ('JP','PMCG3',date '1997-06-21','tcgdex',''),
  ('JP','PMCG4',date '1997-11-21','tcgdex',''),
  ('JP','PMCG5',date '1998-10-24','tcgdex',''),
  ('JP','PMCG6',date '1999-06-25','tcgdex',''),
  ('JP','S-P',date '2022-07-14','tcgdex',''),
  ('JP','SVHK',date '2024-01-26','tcgcollector',''),
  ('JP','SVHM',date '2024-01-26','tcgcollector',''),
  ('JP','SVEM',date '2023-09-22','tcgcollector',''),
  ('JP','SVEL',date '2023-09-22','tcgcollector',''),
  ('JP','SVF',date '2023-07-28','tcgcollector',''),
  ('JP','SVD',date '2023-07-07','tcgcollector',''),
  ('JP','SVP1',date '2023-05-19','tcgcollector',''),
  ('JP','SVC',date '2023-03-24','tcgcollector',''),
  ('JP','SVAL',date '2023-01-20','tcgcollector',''),
  ('JP','SVB',date '2023-01-20','tcgcollector',''),
  ('JP','SVAW',date '2023-01-20','tcgcollector',''),
  ('JP','SVAM',date '2023-01-20','tcgcollector',''),
  ('JP','SVP',date '2022-11-18','tcgcollector',''),
  ('JP','SP6',date '2022-08-05','tcgcollector',''),
  ('JP','SPD',date '2022-07-15','tcgcollector',''),
  ('JP','SPZ',date '2022-07-15','tcgcollector',''),
  ('JP','S10a',date '2022-05-13','tcgdex',''),
  ('JP','S10b',date '2022-06-17','tcgdex',''),
  ('JP','S10D',date '2022-04-08','tcgdex',''),
  ('JP','S10P',date '2022-04-08','tcgdex',''),
  ('JP','S11',date '2022-07-15','tcgdex',''),
  ('JP','S11a',date '2022-09-02','tcgdex',''),
  ('JP','S12',date '2022-10-21','tcgdex',''),
  ('JP','S12a',date '2022-12-02','tcgdex',''),
  ('JP','S1a',date '2020-02-07','tcgdex',''),
  ('JP','S1H',date '2019-12-06','tcgdex',''),
  ('JP','S1W',date '2019-12-06','tcgdex',''),
  ('JP','S2',date '2020-03-06','tcgdex',''),
  ('JP','S2a',date '2020-04-24','tcgdex',''),
  ('JP','S3',date '2020-06-05','tcgdex',''),
  ('JP','S3a',date '2020-07-10','tcgdex',''),
  ('JP','S4',date '2020-09-18','tcgdex',''),
  ('JP','S4a',date '2020-11-20','tcgdex',''),
  ('JP','S5a',date '2021-03-19','tcgdex',''),
  ('JP','S5I',date '2021-01-22','tcgdex',''),
  ('JP','S5R',date '2021-01-22','tcgdex',''),
  ('JP','S6a',date '2021-05-28','tcgdex',''),
  ('JP','S6H',date '2021-04-23','tcgdex',''),
  ('JP','S6K',date '2021-04-23','tcgdex',''),
  ('JP','S7D',date '2021-07-09','tcgdex',''),
  ('JP','S7R',date '2021-07-09','tcgdex',''),
  ('JP','S8',date '2021-09-24','tcgdex',''),
  ('JP','S8a',date '2021-10-22','tcgdex',''),
  ('JP','S8b',date '2021-12-03','tcgdex',''),
  ('JP','S9',date '2022-01-14','tcgdex',''),
  ('JP','S9a',date '2022-02-25','tcgdex',''),
  ('JP','SC',date '2013-02-01','tcgdex',''),
  ('JP','SM0',date '2016-11-18','tcgdex',''),
  ('JP','SM10',date '2019-03-01','tcgdex',''),
  ('JP','SM10a',date '2019-04-05','tcgdex',''),
  ('JP','SM10b',date '2019-04-26','tcgdex',''),
  ('JP','SM11',date '2019-05-31','tcgdex',''),
  ('JP','SM11a',date '2019-07-05','tcgdex',''),
  ('JP','SM11b',date '2019-08-02','tcgdex',''),
  ('JP','SM12',date '2019-09-06','tcgdex',''),
  ('JP','SM12a',date '2019-10-04','tcgdex',''),
  ('JP','SM1M',date '2016-12-09','tcgdex',''),
  ('JP','SM1p',date '2017-01-27','tcgdex',''),
  ('JP','SM1S',date '2016-12-09','tcgdex',''),
  ('JP','SM2K',date '2017-03-17','tcgdex',''),
  ('JP','SM2L',date '2017-03-17','tcgdex',''),
  ('JP','SM2p',date '2017-04-21','tcgdex',''),
  ('JP','SM3H',date '2017-06-16','tcgdex',''),
  ('JP','SM3N',date '2017-06-16','tcgdex',''),
  ('JP','SM3p',date '2017-07-15','tcgdex',''),
  ('JP','SM4A',date '2017-09-15','tcgdex',''),
  ('JP','SM4p',date '2017-10-20','tcgdex',''),
  ('JP','SM4S',date '2017-09-15','tcgdex',''),
  ('JP','SM5M',date '2017-12-08','tcgdex',''),
  ('JP','SM5p',date '2018-01-19','tcgdex',''),
  ('JP','SM5S',date '2017-12-08','tcgdex',''),
  ('JP','SM6',date '2018-03-02','tcgdex',''),
  ('JP','SM6a',date '2018-04-06','tcgdex',''),
  ('JP','SM6b',date '2018-05-30','tcgdex',''),
  ('JP','SM7',date '2018-06-01','tcgdex',''),
  ('JP','SM7a',date '2018-08-03','tcgdex',''),
  ('JP','SM7b',date '2018-08-03','tcgdex',''),
  ('JP','SM8',date '2018-09-07','tcgdex',''),
  ('JP','SM8a',date '2018-10-05','tcgdex',''),
  ('JP','SM8b',date '2018-10-05','tcgdex',''),
  ('JP','SM9',date '2018-12-07','tcgdex',''),
  ('JP','SM9a',date '2019-01-11','tcgdex',''),
  ('JP','SM9b',date '2019-02-01','tcgdex',''),
  ('JP','SMP2',date '2019-04-26','tcgdex',''),
  ('JP','SO',date '2022-11-04','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','SV-P',date '2022-11-29','tcgdex',''),
  ('JP','SV10',date '2025-04-18','tcgdex',''),
  ('JP','SV11B',date '2025-06-06','tcgdex',''),
  ('JP','SV11W',date '2025-06-06','tcgdex',''),
  ('JP','SV1a',date '2023-03-10','tcgdex',''),
  ('JP','SV1S',date '2023-01-20','tcgdex',''),
  ('JP','SV1V',date '2023-01-20','tcgdex',''),
  ('JP','SV2a',date '2023-06-16','tcgdex',''),
  ('JP','SV2D',date '2023-04-14','tcgdex',''),
  ('JP','SV2P',date '2023-04-14','tcgdex',''),
  ('JP','SV3',date '2023-07-28','tcgdex',''),
  ('JP','SV3a',date '2023-09-22','tcgdex',''),
  ('JP','SV4a',date '2023-12-01','tcgdex',''),
  ('JP','SV4K',date '2023-10-27','tcgdex',''),
  ('JP','SV4M',date '2023-10-27','tcgdex',''),
  ('JP','SV5a',date '2024-03-22','tcgdex',''),
  ('JP','SV5K',date '2024-01-26','tcgdex',''),
  ('JP','SV5M',date '2024-01-26','tcgdex',''),
  ('JP','SV6',date '2024-04-26','tcgdex',''),
  ('JP','SV6a',date '2024-06-07','tcgdex',''),
  ('JP','SV7',date '2024-07-19','tcgdex',''),
  ('JP','SV7a',date '2024-09-13','tcgdex',''),
  ('JP','SV8',date '2024-10-18','tcgdex',''),
  ('JP','SV8a',date '2024-12-06','tcgdex',''),
  ('JP','SV9',date '2025-01-24','tcgdex',''),
  ('JP','SV9a',date '2025-03-14','tcgdex',''),
  ('JP','SVG',date '2023-11-10','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','SVI',date '2024-03-08','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','SVJL',date '2024-05-17','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','SVJP',date '2024-05-17','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','SVK',date '2024-07-19','tcgdex',''),
  ('JP','SVLN',date '2024-08-30','tcgdex',''),
  ('JP','SVLS',date '2024-08-30','tcgdex',''),
  ('JP','SVM',date '2024-11-22','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','SVN',date '2025-01-24','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','SVOD',date '2025-02-21','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','SVOM',date '2025-02-21','tcgcollector','page publique « Sets » de TCGCollector, consultée le 2026-10-11'),
  ('JP','VS1',date '2001-07-19','tcgdex',''),
  ('JP','WCS23',date '2023-07-28','tcgdex',''),
  ('JP','web1',date '2001-10-20','tcgdex',''),
  ('JP','XY',date '2017-04-21','tcgdex',''),
  ('JP','XY10',date '2016-03-18','tcgdex',''),
  ('JP','XY11a',date '2016-06-17','tcgdex',''),
  ('JP','XY11b',date '2016-06-17','tcgdex',''),
  ('JP','XY1a',date '2013-12-13','tcgdex',''),
  ('JP','XY1b',date '2013-12-13','tcgdex',''),
  ('JP','XY2',date '2014-03-15','tcgdex',''),
  ('JP','XY3',date '2014-09-13','tcgdex',''),
  ('JP','XY4',date '2014-09-13','tcgdex',''),
  ('JP','XY5a',date '2014-12-13','tcgdex',''),
  ('JP','XY5b',date '2014-12-13','tcgdex',''),
  ('JP','XY6',date '2015-03-14','tcgdex',''),
  ('JP','XY6-B',date '2015-03-14','tcgdex_crosswalk','équivalent TCGdex : XY6'),
  ('JP','XY7',date '2015-06-20','tcgdex',''),
  ('JP','XY7-B',date '2015-06-20','tcgdex_crosswalk','équivalent TCGdex : XY7'),
  ('JP','XY8a',date '2015-09-26','tcgdex',''),
  ('JP','XY8b',date '2015-09-26','tcgdex',''),
  ('JP','XY9',date '2015-12-11','tcgdex',''),
  ('KR','S11a',date '2022-09-02','tcgdex','date de sortie dans la langue du set'),
  ('KR','SV5a',date '2024-05-24','tcgdex','date de sortie dans la langue du set'),
  ('KR','SV6',date '2024-06-21','tcgdex','date de sortie dans la langue du set'),
  ('TC','S10a',date '2022-05-27','tcgdex','date de sortie dans la langue du set'),
  ('TC','S10b',date '2022-06-17','tcgdex','date de sortie dans la langue du set'),
  ('TC','S10D',date '2022-04-22','tcgdex','date de sortie dans la langue du set'),
  ('TC','S10P',date '2022-04-22','tcgdex','date de sortie dans la langue du set'),
  ('TC','S11',date '2022-07-29','tcgdex','date de sortie dans la langue du set'),
  ('TC','S11a',date '2022-09-16','tcgdex','date de sortie dans la langue du set'),
  ('TC','S12',date '2022-11-04','tcgdex','date de sortie dans la langue du set'),
  ('TC','S4',date '2020-10-09','tcgdex','date de sortie dans la langue du set'),
  ('TC','S4a',date '2020-11-27','tcgdex','date de sortie dans la langue du set'),
  ('TC','S5a',date '2021-04-02','tcgdex','date de sortie dans la langue du set'),
  ('TC','S5I',date '2021-01-29','tcgdex','date de sortie dans la langue du set'),
  ('TC','S5R',date '2021-01-29','tcgdex','date de sortie dans la langue du set'),
  ('TC','S6a',date '2021-06-11','tcgdex','date de sortie dans la langue du set'),
  ('TC','S6H',date '2021-05-07','tcgdex','date de sortie dans la langue du set'),
  ('TC','S6K',date '2021-05-07','tcgdex','date de sortie dans la langue du set'),
  ('TC','S7D',date '2021-07-23','tcgdex','date de sortie dans la langue du set'),
  ('TC','S7R',date '2021-07-23','tcgdex','date de sortie dans la langue du set'),
  ('TC','S8',date '2021-10-01','tcgdex','date de sortie dans la langue du set'),
  ('TC','S8a',date '2021-10-20','tcgdex','date de sortie dans la langue du set'),
  ('TC','S8b',date '2021-12-17','tcgdex','date de sortie dans la langue du set'),
  ('TC','S9',date '2022-01-28','tcgdex','date de sortie dans la langue du set'),
  ('TC','S9a',date '2022-03-11','tcgdex','date de sortie dans la langue du set'),
  ('TC','SC1A',date '2020-06-19','tcgdex','date de sortie dans la langue du set'),
  ('TC','SC1B',date '2020-06-19','tcgdex','date de sortie dans la langue du set'),
  ('TC','SC1D',date '2020-06-19','tcgdex','date de sortie dans la langue du set'),
  ('TC','SCA',date '2020-11-27','tcgdex','date de sortie dans la langue du set'),
  ('TC','SCB',date '2021-01-29','tcgdex','date de sortie dans la langue du set'),
  ('TC','SCC',date '2021-06-11','tcgdex','date de sortie dans la langue du set'),
  ('TC','SCD',date '2021-10-01','tcgdex','date de sortie dans la langue du set'),
  ('TC','SDL',date '2022-11-04','tcgdex','date de sortie dans la langue du set'),
  ('TC','SDM',date '2022-11-04','tcgdex','date de sortie dans la langue du set'),
  ('TC','SDP',date '2022-11-04','tcgdex','date de sortie dans la langue du set'),
  ('TC','SH',date '2021-06-28','tcgdex','date de sortie dans la langue du set'),
  ('TC','SI',date '2022-02-18','tcgdex','date de sortie dans la langue du set'),
  ('TC','SJ',date '2022-01-28','tcgdex','date de sortie dans la langue du set'),
  ('TC','SK',date '2022-01-28','tcgdex','date de sortie dans la langue du set'),
  ('TC','SLD',date '2022-03-11','tcgdex','date de sortie dans la langue du set'),
  ('TC','SLL',date '2022-03-11','tcgdex','date de sortie dans la langue du set'),
  ('TC','SN',date '2022-10-02','tcgdex','date de sortie dans la langue du set'),
  ('TC','SP5',date '2021-08-27','tcgdex','date de sortie dans la langue du set'),
  ('TC','SP6',date '2022-08-26','tcgdex','date de sortie dans la langue du set'),
  ('TC','SPD',date '2022-08-26','tcgdex','date de sortie dans la langue du set'),
  ('TC','SPZ',date '2022-08-26','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV-P',date '2023-01-26','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV10',date '2025-05-02','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV1a',date '2023-03-24','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV1s',date '2023-02-03','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV1v',date '2023-02-03','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV2d',date '2023-04-28','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV2p',date '2023-04-28','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV3a',date '2023-09-29','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV4a',date '2023-12-22','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV4K',date '2023-11-10','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV4M',date '2023-11-10','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV5a',date '2024-04-03','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV5K',date '2024-02-02','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV5M',date '2024-02-02','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV6',date '2024-05-10','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV6a',date '2024-06-21','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV7',date '2024-08-02','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV7a',date '2024-09-27','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV8',date '2024-10-25','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV8a',date '2024-12-20','tcgdex','date de sortie dans la langue du set'),
  ('TC','SV9',date '2025-02-07','tcgdex','date de sortie dans la langue du set'),
  ('TC','sval',date '2023-08-11','tcgdex','date de sortie dans la langue du set'),
  ('TC','svam',date '2023-08-11','tcgdex','date de sortie dans la langue du set'),
  ('TC','svaw',date '2023-08-11','tcgdex','date de sortie dans la langue du set'),
  ('TC','svb',date '2023-03-03','tcgdex','date de sortie dans la langue du set'),
  ('TC','SVC',date '2023-04-28','tcgdex','date de sortie dans la langue du set'),
  ('TC','SVD',date '2023-07-21','tcgdex','date de sortie dans la langue du set'),
  ('TC','SVEL',date '2023-09-29','tcgdex','date de sortie dans la langue du set'),
  ('TC','SVEM',date '2023-09-29','tcgdex','date de sortie dans la langue du set'),
  ('TC','SVF',date '2023-08-11','tcgdex','date de sortie dans la langue du set'),
  ('TC','SVHK',date '2024-02-02','tcgdex','date de sortie dans la langue du set'),
  ('TC','SVHM',date '2024-02-02','tcgdex','date de sortie dans la langue du set')
on conflict (language, code) do nothing;

create or replace function public.apply_set_calendar()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare n1 integer; n2 integer;
begin
  update sets set release_date_source = 'import'
  where release_date is not null and release_date_source is null;

  -- 2. date du calendrier (pour la langue et le code du set)
  update sets s set release_date = c.release_date, release_date_source = c.source
  from set_calendar c
  where c.language = s.language and c.code = s.code
    and coalesce(s.release_date_source, '') <> 'manual'
    and (s.release_date is distinct from c.release_date or s.release_date_source is distinct from c.source)
    and (s.release_date is null or s.release_date_source in ('tcgdex','tcgdex_crosswalk','tcgcollector','jp_aligned'));
  get diagnostics n1 = row_count;

  -- 3. KR / TC / SC sans date : date du set JP aligné (approximative)
  update sets s set release_date = j.d, release_date_source = 'jp_aligned'
  from (select a.set_id, min(jp.release_date) as d
        from set_alignments a join sets jp on jp.id = a.jp_set_id
        where jp.release_date is not null group by a.set_id) j
  where j.set_id = s.id and s.language in ('KR','TC','SC') and s.release_date is null;
  get diagnostics n2 = row_count;

  return n1 + n2;
end $$;
revoke execute on function public.apply_set_calendar() from public, anon, authenticated;

create temp table rapport (ordre int, controle text, n bigint) on commit drop;
insert into rapport select 1, 'sets modifiés par apply_set_calendar', public.apply_set_calendar();

insert into rapport
select 10 + row_number() over (order by language, coalesce(release_date_source, 'sans date')),
       language || ' — ' || coalesce(release_date_source, 'sans date'), count(*)
from public.sets group by language, release_date_source;

insert into rapport
select 50, 'sets avec date et sans source (attendu 0)', count(*) from public.sets
where release_date is not null and release_date_source is null
union all
select 51, 'cartes dans des sets JP/KR/TC sans date', count(*) from public.cards c join public.sets s on s.id = c.set_id
where s.language in ('JP','KR','TC') and s.release_date is null;

select * from rapport order by ordre;

commit;
