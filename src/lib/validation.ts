import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid work email")
  .max(254);

export const signinSchema = z.object({
  email: emailSchema,
});

export const chatRequestSchema = z.object({
  conversationId: z.string().trim().min(1).max(120).optional(),
  message: z.string().trim().min(1, "Enter a message").max(4000, "Message is too long"),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
});

export const renameConversationSchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty").max(80, "Title is too long"),
});
