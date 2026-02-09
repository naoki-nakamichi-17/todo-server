import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const app: Express = express();
const PORT = 8080;

app.use(express.json());
app.use(cors());
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || "default-local-secret";

// --- Auto-seed default users on startup ---

const DEFAULT_USERS = [
  { username: "Nakamichi", password: "$2b$10$GFuvfktZoeCDgUwJud49YeC35VEGuxxuqSutnvPeR5sM7cVEqLhkC" },
  { username: "Takahata", password: "$2b$10$nTbj1yp30DLNCMpDxwmBo.5XJrn3VXIQaUp3/rb0Hg9PRrgRfC3ZS" },
  { username: "Kasadate", password: "$2b$10$Ct1Hc3OlsYEETs5IqLk/W.2BLgh6xBFmdpC5l1ZNL.ZUnZwff3f9S" },
  { username: "admin", password: "$2b$10$Pay9Cb53li.VpfO3YPoW9OZmC9UcMih3tEtIhhfAU4f6p0Mksmlrm" },
];

async function seedUsers() {
  const count = await prisma.user.count();
  if (count === 0) {
    for (const u of DEFAULT_USERS) {
      await prisma.user.upsert({
        where: { username: u.username },
        update: {},
        create: { username: u.username, password: u.password },
      });
    }
    console.log("Default users seeded.");
  }
}

seedUsers().catch((e) => console.error("Seed error:", e));

// --- Auth middleware ---

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// --- Auth endpoint ---

app.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({ token, username: user.username });
  } catch (e) {
    return res.status(500).json({ error: "Login failed" });
  }
});

// --- Assignee endpoints ---

app.get("/allAssignees", authMiddleware, async (req: Request, res: Response) => {
  const allAssignees = await prisma.assignee.findMany({
    orderBy: { name: "asc" },
  });
  return res.json(allAssignees);
});

app.post("/createAssignee", authMiddleware, async (req: Request, res: Response) => {
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

app.put("/editAssignee/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body;
    const assignee = await prisma.assignee.update({
      where: { id },
      data: { name },
    });
    return res.json(assignee);
  } catch (e) {
    return res.status(400).json(e);
  }
});

app.delete("/deleteAssignee/:id", authMiddleware, async (req: Request, res: Response) => {
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

app.get("/allTodos", authMiddleware, async (req: Request, res: Response) => {
  const allTodos = await prisma.todo.findMany({
    include: { assignee: true },
    orderBy: { sortOrder: "asc" },
  });
  return res.json(allTodos);
});

app.post("/createTodo", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, description, status, priority, assigneeId } = req.body;
    const maxOrder = await prisma.todo.aggregate({ _max: { sortOrder: true } });
    const createTodo = await prisma.todo.create({
      data: {
        title,
        description,
        status: status || "TODO",
        priority: priority || "MEDIUM",
        assigneeId: assigneeId || null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
      include: { assignee: true },
    });
    return res.json(createTodo);
  } catch (e) {
    return res.status(400).json(e);
  }
});

app.put("/editTodo/:id", authMiddleware, async (req: Request, res: Response) => {
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

app.put("/reorderTodos", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { items } = req.body as { items: { id: number; sortOrder: number }[] };
    await prisma.$transaction(
      items.map((item) =>
        prisma.todo.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        })
      )
    );
    return res.json({ success: true });
  } catch (e) {
    return res.status(400).json(e);
  }
});

app.delete("/deleteTodo/:id", authMiddleware, async (req: Request, res: Response) => {
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
