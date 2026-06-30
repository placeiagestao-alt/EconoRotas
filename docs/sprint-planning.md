# Planejamento por sprints

## Regra de entrega

Implemente em sprints pequenas, uma area por vez, validando cada entrega antes da proxima.

Nao misturar infraestrutura, motor de rota e UX no mesmo commit/release, salvo correcao emergencial.

## Sprint 3 - Observabilidade Executiva

Objetivo: o painel deve dizer a verdade operacional.

Indicadores obrigatorios:

- Rotas otimizadas.
- Rotas iniciadas.
- Rotas concluidas.
- Rotas abandonadas.
- Fallback OSRM.
- Attention strong.
- Entregas marcadas longe do GPS.
- Tempo medio de otimizacao.

Criterio: o admin sabe se o produto esta melhorando ou piorando.

## Sprint 4 - UX de Campo

Objetivo: o motorista deve entender o proximo passo rapido.

Itens:

- Melhorar tela de execucao.
- Destacar STOP, pacote e parada.
- Avisos simples.
- Reduzir texto tecnico.
- Melhorar botoes principais.

Criterio: usuario comum entende o que fazer sem ler painel tecnico.

## Sprint 5 - Disaster Recovery Evidenciavel

Objetivo: o painel deve aceitar Disaster Recovery como pronto somente com
evidencia real de backup e restore.

Itens:

- Gerar backup logico do MySQL operacional.
- Restaurar o backup em banco descartavel.
- Validar contagem de linhas por tabela restaurada.
- Registrar `backup_completed` e `restore_test_passed` somente apos sucesso.
- Manter falhas antigas como historico, sem prender o status quando ha sucesso
  mais recente.

Criterio: admin consegue provar que existe backup recente e restore testado,
sem depender de declaracao manual.
