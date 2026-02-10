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

// --- Auto-seed on startup (users, assignees, todos) ---

async function seedData() {
  // Users
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const users = [
      { username: "Nakamichi", password: "$2b$10$GFuvfktZoeCDgUwJud49YeC35VEGuxxuqSutnvPeR5sM7cVEqLhkC" },
      { username: "Takahata", password: "$2b$10$nTbj1yp30DLNCMpDxwmBo.5XJrn3VXIQaUp3/rb0Hg9PRrgRfC3ZS" },
      { username: "Kasadate", password: "$2b$10$Ct1Hc3OlsYEETs5IqLk/W.2BLgh6xBFmdpC5l1ZNL.ZUnZwff3f9S" },
      { username: "admin", password: "$2b$10$Pay9Cb53li.VpfO3YPoW9OZmC9UcMih3tEtIhhfAU4f6p0Mksmlrm" },
    ];
    for (const u of users) {
      await prisma.user.create({ data: u });
    }
    console.log("Users seeded.");
  }

  // Assignees
  const assigneeCount = await prisma.assignee.count();
  if (assigneeCount === 0) {
    const assignees = [
      { name: "中道", color: "#EF4444" },
      { name: "笠立", color: "#10B981" },
      { name: "高畑", color: "#F59E0B" },
    ];
    for (const a of assignees) {
      await prisma.assignee.create({ data: a });
    }
    console.log("Assignees seeded.");
  }

  // Todos
  const todoCount = await prisma.todo.count();
  if (todoCount === 0) {
    const nakamichi = await prisma.assignee.findUnique({ where: { name: "中道" } });
    const kasadate = await prisma.assignee.findUnique({ where: { name: "笠立" } });
    const takahata = await prisma.assignee.findUnique({ where: { name: "高畑" } });

    const todos = [
      { title: "Docker, ECS学習", description: "Udemy動画学習　L【完全版】AWS ECSコンテナアプリケーション開発（入門から実践まで）", status: "TODO", priority: "MEDIUM", sortOrder: 0, assigneeId: nakamichi?.id },
      { title: "Pythonアプリ作成（チーム開発）", description: "Claudeを複数起動してそれぞれの端末でソースコードを書かせてみる", status: "TODO", priority: "MEDIUM", sortOrder: 1, assigneeId: nakamichi?.id },
      { title: "test", description: "test", status: "TODO", priority: "LOW", sortOrder: 2, assigneeId: kasadate?.id },
      { title: "test", description: "tete", status: "TODO", priority: "MEDIUM", sortOrder: 3, assigneeId: takahata?.id },
      { title: "AIチーム開発ノウハウ習熟", description: "チーム開発で生成AIを使った製造をするときに必要なプロンプトやSkill、テンプレートを用意する", status: "DOING", priority: "HIGH", sortOrder: 4, assigneeId: nakamichi?.id },
      { title: "Python学習", description: "Udemy動画学習　L データ分析、データ分析の基礎から実践レベルのデータ分析のやり方まで", status: "DOING", priority: "MEDIUM", sortOrder: 5, assigneeId: nakamichi?.id },
      { title: "NextJS学習", description: "実際にCo-mitiを参考に画面作成", status: "DONE", priority: "HIGH", sortOrder: 6, assigneeId: nakamichi?.id },
      { title: "Todoアプリの改修", description: "DOING + 概要入力機の追加", status: "DONE", priority: "LOW", sortOrder: 7, assigneeId: nakamichi?.id },
    ];
    for (const t of todos) {
      await prisma.todo.create({ data: { ...t, assigneeId: t.assigneeId ?? null } });
    }
    console.log("Todos seeded.");
  }
}

seedData().catch((e) => console.error("Seed error:", e));

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

// --- Data export/import ---

app.get("/exportData", authMiddleware, async (req: Request, res: Response) => {
  const assignees = await prisma.assignee.findMany({ orderBy: { id: "asc" } });
  const todos = await prisma.todo.findMany({
    include: { assignee: true },
    orderBy: { sortOrder: "asc" },
  });

  const data = {
    exportedAt: new Date().toISOString(),
    assignees: assignees.map((a) => ({ name: a.name, color: a.color })),
    todos: todos.map((t) => ({
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      sortOrder: t.sortOrder,
      assigneeName: t.assignee?.name || null,
    })),
  };

  return res.json(data);
});

app.post("/importData", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { assignees, todos } = req.body;

    // 既存データを削除（Todo → Assignee の順）
    await prisma.todo.deleteMany();
    await prisma.assignee.deleteMany();

    // Assignee復元
    for (const a of assignees) {
      await prisma.assignee.create({ data: { name: a.name, color: a.color } });
    }

    // Todo復元（assigneeNameからIDを解決）
    for (const t of todos) {
      let assigneeId: number | null = null;
      if (t.assigneeName) {
        const found = await prisma.assignee.findUnique({ where: { name: t.assigneeName } });
        assigneeId = found?.id ?? null;
      }
      await prisma.todo.create({
        data: {
          title: t.title,
          description: t.description || null,
          status: t.status,
          priority: t.priority,
          sortOrder: t.sortOrder,
          assigneeId,
        },
      });
    }

    return res.json({ success: true, assignees: assignees.length, todos: todos.length });
  } catch (e) {
    return res.status(400).json({ error: "Import failed" });
  }
});

// タスク追加インポート（既存データを消さずにJSONからタスクを追加）
app.post("/importTodos", authMiddleware, async (req: Request, res: Response) => {
  try {
    const { todos } = req.body;
    if (!todos || !Array.isArray(todos)) {
      return res.status(400).json({ error: "todos array is required" });
    }

    const maxOrder = await prisma.todo.aggregate({ _max: { sortOrder: true } });
    let nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;
    let created = 0;

    for (const t of todos) {
      if (!t.title) continue;

      let assigneeId: number | null = null;
      if (t.assigneeName) {
        const found = await prisma.assignee.findUnique({ where: { name: t.assigneeName } });
        assigneeId = found?.id ?? null;
      }

      await prisma.todo.create({
        data: {
          title: t.title,
          description: t.description || null,
          status: t.status || "TODO",
          priority: t.priority || "MEDIUM",
          sortOrder: nextOrder++,
          assigneeId,
        },
      });
      created++;
    }

    return res.json({ success: true, created });
  } catch (e) {
    return res.status(400).json({ error: "Import failed" });
  }
});

app.listen(PORT, () => console.log("server is running🚀"));
