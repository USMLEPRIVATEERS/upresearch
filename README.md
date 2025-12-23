# UP Research - USMLE Privateers Platform

Plataforma web moderna para gerenciamento da comunidade de revisão sistemática do UP Research.

## 🎨 Paleta de Cores (Baseada na Logo)

### Cores Principais
- **Primary (Navy Blue)**: `#1a2847` - Azul escuro da logo
- **Primary Dark**: `#0f1829` - Variação mais escura
- **Secondary (Burgundy)**: `#a64d4d` - Vermelho bordô da lupa
- **Accent**: `#c85a5a` - Variação mais clara do vermelho
- **White**: `#ffffff` - Texto e elementos claros

### Cores dos Cargos
- **Membro**: `#6b8cae` (Azul claro)
- **Escriba**: `#4a6b8a` (Azul médio)
- **Representante**: `#2d4563` (Azul escuro intermediário)
- **Veterano**: `#1a2847` (Navy blue - cor principal da logo)
- **Chefe**: `#a64d4d` (Burgundy - cor secundária da logo)
- **Senior**: `#8b3838` (Vermelho escuro)
- **Fundador**: `#0f1829` (Azul quase preto)

## 📁 Estrutura de Arquivos

```
WEBSITE/
├── index.html          # Estrutura HTML completa
├── styles.css          # Estilos com tema da logo
├── app.js              # Lógica da aplicação
├── logo.png            # Logo do UP Research
└── README.md           # Esta documentação
```

## 🚀 Como Usar

1. **Adicionar a Logo**: Salve a logo como `logo.png` na pasta principal
2. **Abrir o App**: Abra `index.html` em qualquer navegador moderno
3. **Cadastrar-se**: Preencha o formulário de cadastro
4. **Explorar**: Navegue pelas páginas de Rede, Pesquisas e Perfil

## 💾 Armazenamento Local

O app usa `localStorage` para persistir dados:

- `medicalSchools`: Lista de faculdades de medicina
- `users`: Dados de todos os usuários
- `institutions`: Informações das instituições
- `research`: Projetos de pesquisa
- `currentUser`: Usuário atualmente logado

## 🔐 Hierarquia de Cargos

### MEMBROS (Nível 1) 🔵
- Participar de pesquisas
- Aprender com Veteranos
- Cumprir deadlines

### ESCRIBA (Nível 2) 🔵
- Cargo rotativo temporário
- Anotar informações das lives

### REPRESENTANTE (Nível 3) 🟢
- Monitorar trabalho dos membros
- Preencher relatórios
- Escolher Escribas

### VETERANO (Nível 4) 🟡
- Monitorar múltiplos grupos
- Orientar membros na metodologia
- Ter publicações ou trabalhos em congressos

### CHEFE (Nível 5) 🟠
- Monitorar Veteranos
- Definir funcionamento do UP Research
- Experiência comprovada em gestão

### SENIOR (Nível 6) 🔴
- Residentes nos EUA
- Board certified physicians
- Revisão de projetos cruciais

### FUNDADOR (Nível 7) ⚫
- Marcos Vilela e Iria da Costa
- Autoridade máxima

## ✨ Funcionalidades Principais

### 1. Cadastro Inteligente
- Dropdown com busca de faculdades
- Adicionar novas instituições
- Validação de formato

### 2. Workflow para Primeiro Membro
- Link automático de grupo WhatsApp
- Upload de comprovantes (6 anos)
- Aprovação por Chefes

### 3. Home Dashboard
- Perfil com estatísticas
- Galeria de formulários
- Próximas lives

### 4. Rede Social
- Grid de membros da instituição
- Filtros avançados
- Perfis detalhados

### 5. Gestão de Pesquisas
- Criar novas pesquisas
- Sistema de coautoria
- Filtros por liga e especialidade
- Status: Em Progresso, Finalizada, Arquivada

### 6. Sistema de Ligas e Especialidades

#### Liga de Clínica
- Cardiologia, Endocrinologia, Gastroenterologia
- Nefrologia, Pneumologia, Reumatologia
- Infectologia, Hematologia, Oncologia
- Neurologia, Psiquiatria, Geriatria
- Medicina de Família

#### Liga de Cirurgia
- Cirurgia Geral, Cardiovascular, Neurocirurgia
- Ortopedia, Oftalmologia, Otorrinolaringologia
- Urologia, Cirurgia Plástica, Torácica
- Cirurgia Vascular, Ginecologia e Obstetrícia

## 🎯 Próximos Passos

### Integração com Supabase
Criar as seguintes tabelas:

```sql
-- Medical Schools
CREATE TABLE medical_schools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    abbreviation TEXT,
    students_per_class INTEGER,
    minimum_members INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    whatsapp TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    medical_school_id UUID REFERENCES medical_schools(id),
    student_status TEXT CHECK (student_status IN ('student', 'graduated')),
    role TEXT CHECK (role IN ('MEMBRO', 'ESCRIBA', 'REPRESENTANTE', 'VETERANO', 'CHEFE', 'SENIOR', 'FUNDADOR')),
    league TEXT CHECK (league IN ('clinica', 'cirurgia')),
    specialty TEXT,
    deadlines_missed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Institutions
CREATE TABLE institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medical_school_id UUID REFERENCES medical_schools(id),
    whatsapp_group TEXT,
    approved BOOLEAN DEFAULT FALSE,
    first_member_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Research Projects
CREATE TABLE research_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    league TEXT CHECK (league IN ('clinica', 'cirurgia')),
    specialty TEXT NOT NULL,
    status TEXT CHECK (status IN ('em_progresso', 'finalizada', 'arquivada')),
    accepting_coauthors BOOLEAN DEFAULT TRUE,
    author_id UUID REFERENCES users(id),
    institution_id UUID REFERENCES institutions(id),
    start_date TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Research Coauthors
CREATE TABLE research_coauthors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    research_id UUID REFERENCES research_projects(id),
    user_id UUID REFERENCES users(id),
    joined_at TIMESTAMP DEFAULT NOW()
);
```

### Automação WhatsApp Bot
- Criar grupos pré-configurados
- Bot com contagem regressiva diária
- Notificações automáticas

### Features Futuras
- Sistema de notificações
- Chat interno
- Dashboard de analytics
- Exportação de dados
- Integração com Google Forms
- Sistema de gamificação

## 📱 Redes Sociais

- **Twitter**: [@upresearchusmle](https://twitter.com/upresearchusmle)
- **Instagram**: [@usmleprivateers](https://instagram.com/usmleprivateers)

## 👥 Fundadores USMLE Privateers

- Marcos Vilela
- Iria da Costa

---

**UP Research** - Systematic Review and Meta-Analysis Group of the Brazilian greatest USMLE Community 🇺🇸
