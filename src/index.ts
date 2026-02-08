import express from "express";
import type { Express, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import cors from "cors";

const app: Express = express();
const PORT = 8080;

app.use(express.json());
app.use(cors());
const prisma = new PrismaClient();

// --- Assignee endpoints ---

app.get("/allAssignees", async (req: Request, res: Response) => {
  const allAssignees = await prisma.assignee.findMany({
    orderBy: { name: "asc" },
  });
  return res.json(allAssignees);
});

app.post("/createAssignee", async (req: Request, res: Response) => {
  try {
    const { name, color } = req.body;
    const assignee = await prisma.assignee.create({
      data: { name, color: color || undefined },
    });
    return res.json(assignee);
  } catch (e) {
    return res.status(400).json(e);
  }
});

app.delete("/deleteAssignee/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    // 担当者に紐づくTodoのassigneeIdをnullに更新
    await prisma.todo.updateMany({
      where: { assigneeId: id },
      data: { assigneeId: null },
    });
    const deletedAssignee = await prisma.assignee.delete({ where: { id } });
    return res.json(deletedAssignee);
  } catch (e) {
    return res.status(400).json(e);
  }
});

// --- Todo endpoints ---

app.get("/allTodos", async (req: Request, res: Response) => {
  const allTodos = await prisma.todo.findMany({
    include: { assignee: true },
  });
  return res.json(allTodos);
});

app.post("/createTodo", async (req: Request, res: Response) => {
  try {
    const { title, description, status, priority, assigneeId } = req.body;
    const createTodo = await prisma.todo.create({
      data: {
        title,
        description,
        status: status || "TODO",
        priority: priority || "MEDIUM",
        assigneeId: assigneeId || null,
      },
      include: { assignee: true },
    });
    return res.json(createTodo);
  } catch (e) {
    return res.status(400).json(e);
  }
});

app.put("/editTodo/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { title, description, status, priority, assigneeId } = req.body;
    const editTodo = await prisma.todo.update({
      where: { id },
      data: {
        title,
        description,
        status,
        priority,
        assigneeId: assigneeId !== undefined ? (assigneeId || null) : undefined,
      },
      include: { assignee: true },
    });
    return res.json(editTodo);
  } catch (e) {
    return res.status(400).json(e);
  }
});

app.delete("/deleteTodo/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const deleteTodo = await prisma.todo.delete({
      where: { id },
    });
    return res.json(deleteTodo);
  } catch (e) {
    return res.status(400).json(e);
  }
});

app.listen(PORT, () => console.log("server is running🚀"));
