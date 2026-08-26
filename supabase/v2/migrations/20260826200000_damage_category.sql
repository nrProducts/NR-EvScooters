alter table damages add column damage_category text;
alter table damages add constraint chk_damages_category
    check (damage_category is null or damage_category in
        ('body','panel','battery','tyre','brake','electrical','other'));
