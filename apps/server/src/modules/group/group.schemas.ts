import { z } from 'zod';

const emailList = z
  .array(z.string().trim().toLowerCase().email())
  .max(200, 'Too many members in one request')
  .default([]);

export const createGroupSchema = z
  .object({
    name: z.string().trim().min(1, 'Group name is required').max(120),
    members: emailList,
    admins: emailList,
  })
  .refine((value) => value.admins.every((admin) => value.members.includes(admin)), {
    message: 'Every admin must also be listed as a member',
    path: ['admins'],
  });

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    members: emailList.optional(),
    admins: emailList.optional(),
  })
  .refine(
    (value) =>
      !value.admins || !value.members || value.admins.every((a) => value.members?.includes(a)),
    { message: 'Every admin must also be listed as a member', path: ['admins'] },
  );

export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

/** Route params arrive as strings; coerce and validate rather than `Number(x)`. */
export const groupIdParamSchema = z.object({
  groupId: z.coerce.number().int().positive(),
});
