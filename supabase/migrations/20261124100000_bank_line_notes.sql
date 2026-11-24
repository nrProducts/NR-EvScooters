-- Notes on bank statement lines.
--
-- A category says WHAT a line is ("Other expense"); a note says WHY
-- ("Tea for hub staff", "Advance salary for Nov"). One editable note per line,
-- written by anyone who can view Reconciliation. Every change is recorded in
-- the audit log (settlement.bank_line_note_updated) with the old and new text.
--
-- Separate from resolved_note, which stays the fixed reason an exception was
-- closed. The figures guard (trg_statement_lines_guard) does not cover these
-- columns, so the bank figures stay immutable.

alter table public.external_statement_lines
    add column note            text,
    add column note_by_user_id uuid,
    add column note_at         timestamptz,
    add constraint external_statement_lines_note_by_user_id_fkey
        foreign key (note_by_user_id) references public.users (id) on delete set null,
    add constraint chk_statement_lines_note_length
        check (note is null or char_length(note) between 1 and 500);

comment on column public.external_statement_lines.note is
    'Free-text note from staff on why this line happened (e.g. what an "Other expense" was for). Editable; history in audit_logs.';
