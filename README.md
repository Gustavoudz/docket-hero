# Legado CRM

Quero que você crie a primeira versão funcional de um sistema interno para gerenciar minha loja de venda de iPhones e MacBooks seminovos. Essa primeira versão deve cobrir apenas o módulo de AGENDAMENTO, que vai ser a base do sistema completo (outros módulos como estoque e controle de vendas serão adicionados depois).

CONTEXTO

Hoje a equipe da loja (vendedoras e atendentes) organiza todos os agendamentos de clientes manualmente pelo Telegram, o que gera bagunça e perda de informação. Preciso de um app web simples, rápido e funcional pra substituir isso — pensado pra ser usado no celular, no meio do atendimento, sem curva de aprendizado.

QUEM VAI USAR

- Atendente/Vendedora: cria, edita e conclui os agendamentos do dia a dia

- Gerente (eu): vê todos os agendamentos de todas as atendentes, com visão geral

FUNCIONALIDADE PRINCIPAL: AGENDAMENTO

1. Login simples com dois perfis: "Atendente" e "Gerente" (autenticação por e-mail/senha).

2. Tela principal, organizada por dia:

- Seletor de data no topo

- Lista dos agendamentos daquele dia

- Botão "+ Novo agendamento"

3. Formulário de novo agendamento, com os campos:

- Nome do cliente (obrigatório)

- Modelo do aparelho de interesse (obrigatório)

- Data e horário (obrigatório)

- Sinal pago? (sim/não)

- Observações (opcional)

- Atendente responsável (preenchido automaticamente com quem está logada)

4. Cada agendamento tem um status: Pendente, Concluído ou Cancelado.

- Ao mudar para "Cancelado", o sistema OBRIGA o preenchimento de um motivo antes de salvar — não deixa cancelar sem justificar.

- Ao mudar para "Concluído", marca a venda como fechada.

5. Fechamento do dia:

- Botão "Fechar o dia", que só fica disponível quando todos os agendamentos do dia já têm status definido (nenhum "Pendente" sobrando).

- Se tiver algo pendente, bloqueia o fechamento e avisa o que falta.

- Ao fechar, gera um resumo: total de agendamentos, quantos concluídos, quantos cancelados (com os motivos) e taxa de conversão do dia.

6. Painel do gerente:

- Visão consolidada de todos os dias e todas as atendentes

- Filtro por atendente e por período

- Números: total de agendamentos, concluídos, cancelados e motivos de cancelamento mais comuns

7. Notificações dentro do app (tipo sino/toast):

- Avisa o gerente quando um novo agendamento é criado

- Avisa quando um agendamento é concluído (venda fechada)

REGRAS IMPORTANTES

- Atendente só vê e edita os próprios agendamentos

- Gerente vê tudo

- Não pode fechar o dia com agendamento pendente

- Não pode cancelar agendamento sem motivo

DESIGN

- Interface limpa, direta, rápida — pensada pra alguém sem tempo de "aprender o sistema"

- Priorize funcionalidade e clareza acima de estética carregada, nada de elemento decorativo desnecessário

- Cores neutras, boa legibilidade, ótimo em tela de celular

- Criar e concluir um agendamento deve caber em poucos cliques

ESTRUTURA PENSANDO NO FUTURO

Modele o banco de dados já prevendo que, nas próximas versões, vou plugar dois módulos que se conectam a este: Controle de Vendas (dados financeiros da venda fechada) e Estoque (aparelhos disponíveis, vinculados por e-mail/número de série). Não precisa criar as telas desses módulos agora — só deixa o modelo de dados aberto pra eu conectar depois.

Comece construindo o fluxo de login + criação/gestão de agendamento funcionando de ponta a ponta antes de partir pro painel do gerente.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://docket-hero.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/81ee71f1-406d-4ce1-9c73-091c3d093065).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
