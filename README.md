# Simplex Didático — Alocação de Médicos em Consultórios

Projeto desenvolvido para a disciplina de *Algebra Linear Acançada para Computação*, com o objetivo de implementar um "*Simplex* Didático" capaz de resolver problemas de maximização e apresentar visualmente cada etapa do algoritmo por meio de tableaus.

O problema escolhido pertence ao tema **Saúde** e consiste na otimização da quantidade de horas trabalhadas por médicos em consultórios hospitalares.

## Objetivo

Determinar quantas horas cada médico deve trabalhar por dia para **maximizar o número total de pacientes atendidos**, respeitando:

* o limite de horas de trabalho de cada médico;
* a disponibilidade dos consultórios;
* o orçamento diário do hospital;
* a não negatividade das variáveis.

O sistema permitirá que o usuário informe dinamicamente a quantidade de médicos, consultórios e restrições do problema.

O sistema deve apresentar o processo de resolução passo a passo, destacando:

* a variável que entra na base;
* a variável que sai da base;
* a coluna pivô;
* a linha pivô;
* o elemento pivô;
* o tableau resultante de cada iteração.

## Descrição do problema

Considere um hospital com `n` médicos distribuídos entre diferentes consultórios.

Cada médico possui:

* uma quantidade média de pacientes atendidos por hora;
* um custo por hora trabalhada;
* um limite máximo de horas diárias;
* um consultório ao qual está associado.

O hospital possui uma quantidade limitada de horas disponíveis em cada consultório e um orçamento máximo diário.

A decisão consiste em definir a quantidade de horas trabalhadas por cada médico.

## Variáveis de decisão

Para cada médico cadastrado, será criada uma variável de decisão:

x_1, x_2, ..., x_n

Onde `n` corresponde à quantidade de médicos informada pelo usuário.

## Função objetivo

A função objetivo busca maximizar o número total de pacientes atendidos:

```
max Z = sum(p_i * x_i), para i = 1 até n
```

Onde:

* `p_i`: quantidade média de pacientes atendidos por hora pelo médico `i`;
* `x_i`: quantidade de horas trabalhadas pelo médico `i`.

De forma expandida:

```
max Z = p_1*x_1 + p_2*x_2 + ... + p_n*x_n
```

## Restrições

### Limite individual de horas

Cada médico possui um limite máximo de horas diárias:

```
x_i <= h_i
```

Onde `h_i` representa a carga horária máxima do médico `i`.

### Disponibilidade dos consultórios

Os médicos que utilizam o mesmo consultório compartilham o tempo disponível da sala.

Para cada consultório `r`:

```
sum(x_i), para i em C_r <= X_r
```

Onde:

* `C_r`: conjunto de médicos associados ao consultório `r`;
* `X_r`: quantidade total de horas disponíveis no consultório `r`.

Exemplo:

Se os médicos 1, 4 e 7 utilizam o consultório 1:

```
x_1 + x_4 + x_7 <= X_1
```

Essa restrição considera que os médicos podem utilizar o consultório em horários consecutivos.

### Restrição orçamentária

A soma dos custos diários dos médicos não pode ultrapassar o orçamento disponível:

```
sum(w_i * x_i), para i = 1 até n <= B
```

Onde:

* `w_i`: custo por hora do médico `i`;
* `B`: orçamento máximo diário do hospital.

De forma expandida:

```
w_1*x_1 + w_2*x_2 + ... + w_n*x_n <= B
```

### Não negatividade

Nenhum médico pode trabalhar uma quantidade negativa de horas:

```
x_i >= 0
```

## Forma padrão

Para utilizar o método Simplex, são adicionadas variáveis de folga às restrições.

### Limites dos médicos

```
x_i + s_i = h_i
```

### Disponibilidade dos consultórios

```
sum(x_i), para i em C_r + s_r = X_r
```

### Orçamento

```
sum(w_i * x_i), para i = 1 até n + s_B = B
```

Todas as variáveis de decisão e de folga devem ser não negativas.

## Funcionalidades previstas

* cadastro de médicos:
  * definição da produtividade de cada médico;
  * definição do custo por hora;
  * definição do limite máximo de horas;
* cadastro de consultórios:
  * associação dos médicos aos consultórios;
  * definição da disponibilidade de cada consultório;
* definição do orçamento diário;
* geração automática do tableau inicial;
* execução passo a passo do método Simplex;
* destaques visuais:
  * variável que entra na base;
  * variavel que sai da base;
  * linha, coluna e elemento pivô;
* exibição da base atual;
* exibição do valor atual da função objetivo;
* navegação entre as iterações;
* controle por botões, teclado ou cliques do mouse;
* apresentação da solução ótima;
* identificação de problemas ilimitados ou sem solução viável.

## Exemplo simplificado

Considere três médicos:

| Médico | Pacientes por hora | Custo por hora | Máximo de horas |
| ------ | ------------------ | -------------- | --------------- |
| M1     | 4                  | 100            | 6               |
| M2     | 5                  | 150            | 5               |
| M3     | 3                  | 80             | 8               |

Função objetivo:

```
max Z = 4*x_1 + 5*x_2 + 3*x_3
```

Restrições:

```
x_1 <= 6
x_2 <= 5
x_3 <= 8
```

Caso os médicos 1 e 2 utilizem o mesmo consultório durante um expediente de 8 horas:

```
x_1 + x_2 <= 8
```

Considerando um orçamento diário de 1400:

```
100*x_1 + 150*x_2 + 80*x_3 <= 1400
x_1, x_2, x_3 >= 0
```

## Resultado esperado

Ao final da execução, o sistema deverá apresentar:

* quantidade ideal de horas de cada médico;
* número máximo de pacientes atendidos;
* custo total da solução;
* utilização de cada consultório;
* recursos utilizados e recursos restantes;
* tableau final;
* sequência completa das iterações do método Simplex.

## Funcionalidade adicional planejada

Como extensão do projeto, pretende-se implementar um método alternativo baseado no **Simplex com variáveis limitadas**.

Na implementação principal, os limites máximos de horas dos médicos serão representados como restrições convencionais:

```text
x_i <= h_i
```

Após a introdução das variáveis de folga:

```text
x_i + s_i = h_i
```

Essas restrições serão incluídas diretamente no tableau, seguindo o método Simplex padrão.

Como funcionalidade adicional, o sistema poderá permitir que os limites inferiores e superiores das variáveis sejam armazenados separadamente, sem criar uma linha específica no tableau para cada limite individual.

Nesse método alternativo, cada variável poderá possuir:

```text
limite inferior: 0
limite superior: h_i
```

O teste da razão será adaptado para verificar:

* quando uma variável básica atinge seu limite inferior;
* quando uma variável básica atinge seu limite superior;
* quando a variável entrante atinge seu próprio limite superior;
* quando deve ocorrer uma troca de variável na base;
* quando ocorre apenas uma troca entre o limite inferior e o limite superior.

Caso a variável entrante atinja seu limite superior antes que alguma variável básica deixe a região viável, poderá ocorrer uma **troca de limite**, sem uma troca convencional de base.

Essa extensão será tratada como um modo avançado e opcional do sistema, pois exige alterações no teste da razão, no controle das variáveis não básicas e na atualização das soluções.

### Modos previstos

O sistema poderá oferecer dois modos de resolução:

1. **Simplex padrão**

   Os limites máximos dos médicos são convertidos em restrições e incluídos no tableau com variáveis de folga.

2. **Simplex com variáveis limitadas**

   Os limites são armazenados separadamente e considerados diretamente durante o teste da razão.

O Simplex padrão será a implementação principal do projeto. O Simplex com variáveis limitadas será desenvolvido posteriormente como funcionalidade bônus.

