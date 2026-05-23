# Guia de Desenvolvimento - Roteirização Inteligente

## 🛠️ Setup Local

```bash
# Clonar projeto
git clone <repo-url>
cd routing-pwa

# Instalar dependências
pnpm install

# Configurar .env (já vem com Manus)
# Mapas usam OpenStreetMap/Leaflet e não exigem chave de API
# DATABASE_URL=<mysql-connection>

# Executar dev
pnpm dev

# Build
pnpm build

# Testes
pnpm test
```

---

## 📝 Padrões de Desenvolvimento

### 1. Adicionar Nova Feature

**Backend (tRPC Procedure)**:
```typescript
// server/routers.ts
export const appRouter = router({
  myFeature: router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        return db.getMyFeatures(ctx.user.id);
      }),
    create: protectedProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async ({ ctx, input }) => {
        return db.createMyFeature(ctx.user.id, input);
      }),
  }),
});
```

**Frontend (React Component)**:
```typescript
// client/src/pages/MyFeature.tsx
import { trpc } from "@/lib/trpc";

export default function MyFeature() {
  const { data, isLoading } = trpc.myFeature.list.useQuery();
  const createMutation = trpc.myFeature.create.useMutation();

  return (
    <DashboardLayout>
      {/* UI aqui */}
    </DashboardLayout>
  );
}
```

### 2. Adicionar Query Helper

```typescript
// server/db.ts
export async function getMyFeatures(userId: number) {
  const db = await getDb();
  return db
    .select()
    .from(myFeatures)
    .where(eq(myFeatures.userId, userId));
}
```

### 3. Adicionar Teste

```typescript
// server/myfeature.test.ts
import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

describe("myFeature", () => {
  it("should list features for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.myFeature.list();
    expect(result).toBeInstanceOf(Array);
  });
});
```

---

## 🗄️ Schema Database

### Adicionar Nova Tabela

```typescript
// drizzle/schema.ts
export const myTable = mysqlTable("my_table", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MyTable = typeof myTable.$inferSelect;
```

### Gerar Migration

```bash
pnpm drizzle-kit generate
# Revisar SQL em drizzle/migrations/
# Aplicar via webdev_execute_sql
```

---

## 🎨 Componentes UI

### Usar shadcn/ui

```typescript
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";

export function MyComponent() {
  return (
    <Card>
      <Button>Click me</Button>
      <Dialog>
        <p>Content</p>
      </Dialog>
    </Card>
  );
}
```

### Tailwind Classes

```typescript
// Use classes diretamente
<div className="flex gap-4 p-6 bg-card text-card-foreground rounded-lg shadow-md">
  {/* Componente */}
</div>
```

---

## 🔄 Fluxo de Dados

```
User Action (React)
    ↓
trpc.feature.mutation()
    ↓
Server Procedure (tRPC)
    ↓
Database Helper (Drizzle)
    ↓
MySQL Query
    ↓
Response com Superjson
    ↓
Frontend State Update
```

---

## 🧪 Executar Testes

```bash
# Todos os testes
pnpm test

# Um arquivo específico
pnpm test server/optimization.test.ts

# Watch mode
pnpm test --watch

# Com coverage
pnpm test --coverage
```

---

## 📦 Deployment

1. **Criar Checkpoint**:
```bash
# Via webdev_save_checkpoint
```

2. **Publicar**:
```bash
# Clique "Publish" no Management UI
# Ou use CLI do Manus
```

3. **Verificar**:
```bash
# Acesse https://roteirizepwa-8ivt5dfb.manus.space
```

---

## 🐛 Debug

### Logs do Servidor
```bash
tail -f .manus-logs/devserver.log
```

### Logs do Navegador
```bash
tail -f .manus-logs/browserConsole.log
```

### Network Requests
```bash
tail -f .manus-logs/networkRequests.log
```

---

## 📚 Referências

- **tRPC**: https://trpc.io
- **Drizzle**: https://orm.drizzle.team
- **Tailwind**: https://tailwindcss.com
- **shadcn/ui**: https://ui.shadcn.com
- **Recharts**: https://recharts.org

---

## ✅ Checklist para Nova Feature

- [ ] Schema criado em `drizzle/schema.ts`
- [ ] Migration gerada e aplicada
- [ ] Query helper em `server/db.ts`
- [ ] Procedure tRPC em `server/routers.ts`
- [ ] Testes em `server/feature.test.ts`
- [ ] Página React em `client/src/pages/`
- [ ] Componentes reutilizáveis em `client/src/components/`
- [ ] Integrado no `App.tsx` routing
- [ ] Todos os testes passando
- [ ] Checkpoint criado

---

**Versão**: 1.0.0  
**Última Atualização**: 2026-05-16
