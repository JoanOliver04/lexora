-- LEX-22.3: the existing CEFR levels keep their order and meaning.
set lock_timeout = '5s';
alter type public.cefr_level add value if not exists 'C2';
reset lock_timeout;
