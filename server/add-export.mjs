import fs from 'fs';

const routersPath = 'server/routers.ts';
const content = fs.readFileSync(routersPath, 'utf-8');

const exportProcedure = `    export: protectedProcedure.input(z.object({
      format: z.enum(["pdf", "csv"]),
      fileName: z.string().min(1),
    }))
      .mutation(async ({ ctx, input }) => {
        const { exportHistoryToS3 } = await import("./export");
        return exportHistoryToS3(
          ctx.user.id,
          input.format,
          input.fileName,
          ctx.user.name || "Usuário"
        );
      }),`;

const newContent = content.replace(
  /    update: protectedProcedure\.input\(z\.object\(\{\n      id: z\.number\(\),\n      status: z\.enum\(\["in_progress", "completed", "cancelled"]\)\.optional\(\),\n      actualDistance: z\.number\(\)\.optional\(\),\n      actualTime: z\.number\(\)\.optional\(\),\n      storageKey: z\.string\(\)\.optional\(\),\n    }\)\)\n      \.mutation\(\({ ctx, input }\) => \{\n        const \{ id, \.\.\.data \} = input;\n        return db\.updateHistory\(id, ctx\.user\.id, data\);\n      }\),\n  }\),/,
  `    update: protectedProcedure.input(z.object({
      id: z.number(),
      status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
      actualDistance: z.number().optional(),
      actualTime: z.number().optional(),
      storageKey: z.string().optional(),
    }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateHistory(id, ctx.user.id, data);
      }),
${exportProcedure}
  }),`
);

fs.writeFileSync(routersPath, newContent);
console.log('Export procedure added to routers.ts');
