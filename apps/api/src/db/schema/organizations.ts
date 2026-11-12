import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const orgRoleEnum = pgEnum('org_role', ['admin', 'developer']);
/*
CASCADE → Sil, əlaqəliləri də sil.
SET NULL → Sil, əlaqəni boşalt.
RESTRICT → Əlaqə varsa, silmə.
*/
export const organizations = pgTable('organizations', {
  id: uuid().defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const orgMembers = pgTable('org_members', {
  id: uuid().defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: orgRoleEnum('role').notNull().default('developer'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  removedAt: timestamp('removed_at'),
});


//database-dən məlumat oxuyarkən (SELECT) gələcək obyektin TypeScript type-ını çıxarır.
export type Organization = typeof organizations.$inferSelect;

//database-ə yeni məlumat əlavə edərkən (INSERT) istifadə ediləcək type-dır.
export type NewOrganization = typeof organizations.$inferInsert;

//org_members cədvəlindən məlumat oxuyarkən gələn obyektin type-ıdır.
export type OrgMember = typeof orgMembers.$inferSelect;

//Yeni organization member əlavə etmək üçün istifadə edilən type-dır
export type NewOrgMember = typeof orgMembers.$inferInsert;
