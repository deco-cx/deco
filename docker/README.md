# Docker Compose - Deco MCP Mesh

Esta é a versão local usando Docker Compose, para acelerar os seus testes com a aplicação Deco MCP Mesh direto no seu computador ou servidor.

## 📋 Índice

- [Visão Geral](#-visão-geral)
- [Pré-requisitos](#-pré-requisitos)
- [Quick Start](#-quick-start---início-em-4-passos)
- [Configuração](#️-configuração)
- [Uso com SQLite (Padrão)](#-uso-com-sqlite-padrão)
- [Uso com PostgreSQL](#-uso-com-postgresql)
- [Configuração de Autenticação](#-configuração-de-autenticação-auth-configjson)
- [Segurança](#-segurança)
- [Monitoramento](#-monitoramento)
- [Troubleshooting](#-troubleshooting)
- [Atualização](#-atualização)
- [Backup e Restore](#-backup-e-restore)

## 🎯 Visão Geral

- ✅ **SQLite por padrão** - Funciona imediatamente sem configuração adicional
- ✅ **PostgreSQL opcional** - Configure via variável de ambiente
- ✅ **Persistência de dados** - Volume Docker para manter dados entre reinicializações
- ✅ **Health checks** - Monitoramento automático da saúde da aplicação
- ✅ **Configuração via variáveis** - Todas as configurações via `.env`

## 📦 Pré-requisitos

- Docker 20.10+
- Docker Compose 2.0+
- (Opcional) PostgreSQL se quiser usar banco externo

## ⚡ Quick Start - Início em 4 passos

A forma mais rápida de testar a aplicação:

```bash
# 1. Configure variáveis de ambiente
# Edite .env e configure BETTER_AUTH_SECRET (obrigatório)
# Gere um secret: openssl rand -base64 32
cp conf-examples/env.example .env

# 2. Configure a autenticação
cp conf-examples/auth-config.json.example auth-config.json

# 3. Inicie a aplicação
docker compose up -d

# 4. Acesse
open http://localhost:3000
```

Essas configurações são tudo que você precisa para iniciar os testes com o MCP-MESH. Se precisar de outras opções, consulte as informações nas próximas seções.

### 📝 Configuração Mínima

O arquivo `.env` precisa ter pelo menos:

```bash
BETTER_AUTH_SECRET=seu_secret_gerado_aqui
```

Todas as outras variáveis têm valores padrão que funcionam para testes locais.

## ⚙️ Configurações

### Arquivo .env

O arquivo `.env` contém todas as configurações.

Principais variáveis:
| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `IMAGE_REPOSITORY` | `ghcr.io/decocms/admin/mesh` | Repositório da imagem |
| `IMAGE_TAG` | `latest` | Tag da imagem |
| `PORT` | `3000` | Porta exposta no host |
| `NODE_ENV` | `production` | Ambiente Node.js |
| `BETTER_AUTH_URL` | `http://localhost:3000` | URL para autenticação |
| `BASE_URL` | `http://localhost:3000` | URL base da aplicação |
| `BETTER_AUTH_SECRET` | **obrigatório** | Secret de autenticação |
| `DATABASE_URL` | `/app/data/mesh.db` | URL do banco (SQLite ou PostgreSQL) |

## 💾 Uso com SQLite (Padrão)

SQLite é o padrão e não requer configuração adicional:

```bash
# .env
DATABASE_URL=/app/data/mesh.db
```

Os dados serão persistidos no volume Docker `mesh-data` e mantidos entre reinicializações.

**Vantagens:**
- ✅ Zero configuração
- ✅ Funciona imediatamente
- ✅ Ideal para desenvolvimento e testes

**Limitações:**
- ⚠️ Apenas 1 instância (não escalável horizontalmente)
- ⚠️ Performance limitada para grandes volumes de dados

## 🐘 Uso com PostgreSQL

Para usar PostgreSQL, você tem duas opções:

### Opção 1: Usar docker-compose.postgres.yml (Recomendado)

Já existe um arquivo `docker-compose.postgres.yml` pronto para uso:

Configure no `.env`:
```bash
POSTGRES_USER=mesh_user
POSTGRES_PASSWORD=senha_segura_aqui
POSTGRES_DB=mesh_db
```

```bash
# Iniciar com PostgreSQL incluído
docker compose -f docker-compose.postgres.yml up -d
```

O `DATABASE_URL` será configurado automaticamente, mas você pode especificá-lo caso necessário.

```bash
DATABASE_URL=postgresql://mesh_user:senha_segura_aqui@localhost:5432/mesh_db
```

### Opção 2: PostgreSQL Externo

Se você já tem um PostgreSQL rodando (local ou remoto):

```bash
# .env
DATABASE_URL=postgresql://usuario:senha@host:5432/nome_do_banco
```

**Exemplo com PostgreSQL local:**
```bash
DATABASE_URL=postgresql://postgres:senha@localhost:5432/mesh_db
```

**Exemplo com PostgreSQL remoto:**
```bash
DATABASE_URL=postgresql://usuario:senha@db.example.com:5432/mesh_db
```

**Vantagens do PostgreSQL:**
- ✅ Suporta múltiplas instâncias (escalabilidade horizontal)
- ✅ Melhor performance para grandes volumes
- ✅ Recursos avançados (backups, replicação, etc.)

## 🔐 Configuração de Autenticação (auth-config.json)

### 📍 Localização no Container

O arquivo `auth-config.json` é montado no caminho:

```
/app/apps/mesh/auth-config.json
```

### 🔄 Como funciona no Docker Compose

#### 1. Arquivo Local

O arquivo `auth-config.json` deve existir na pasta raiz, junto com o docker-compose para subir a stack:

```yaml
volumes:
  - ./auth-config.json:/app/apps/mesh/auth-config.json:ro
```

#### 2. Montagem no Container

- **Origem**: `./auth-config.json` (arquivo na raiz, junto com o docker-compose)
- **Destino**: `/app/apps/mesh/auth-config.json` (dentro do container)
- **Modo**: `ro` (read-only, somente leitura)

#### 3. Quando é Carregado

A aplicação Mesh carrega este arquivo na inicialização para configurar:

- Email/Password authentication
- Social providers (Google, GitHub)
- SAML providers
- Email providers (Resend, etc.)
- Magic link configuration

### 📝 Estrutura do Arquivo

O arquivo `auth-config.json` pode ter diferentes níveis de complexidade dependendo das funcionalidades que você deseja habilitar.

#### Arquivos de Exemplo Disponíveis

Existem dois arquivos de exemplo na pasta `conf-examples/`:

##### 1. `auth-config.json.example` - Configuração Simples

Use este arquivo quando você precisa apenas de autenticação básica por email e senha:

```json
{
  "emailAndPassword": {
    "enabled": true
  }
}
```

**Quando usar:**
- Apenas autenticação por email/senha
- Não precisa de SSO ou login social
- Não precisa enviar emails (convites, magic links, etc.)

##### 2. `auth-config-sso-email.json.example` - Configuração Completa

Use este arquivo quando você precisa de funcionalidades avançadas como SSO, login social e envio de emails:

```json
{
  "emailAndPassword": {
    "enabled": true
  },
  "socialProviders": {
    "google": {
      "clientId": "",
      "clientSecret": ""
    },
    "github": {
      "clientId": "",
      "clientSecret": ""
    }
  },
  "saml": {
    "enabled": false,
    "providers": []
  },
  "emailProviders": [
    {
      "id": "resend-primary",
      "provider": "resend",
      "config": {
        "apiKey": "",
        "fromEmail": "noreply@example.com"
      }
    }
  ],
  "inviteEmailProviderId": "resend-primary",
  "magicLinkConfig": {
    "enabled": true,
    "emailProviderId": "resend-primary"
  }
}
```

**Quando usar:**
- Precisa de SSO (SAML)
- Precisa de login social (Google, GitHub)
- Precisa enviar emails (convites, magic links, etc.)
- Precisa de magic links para autenticação sem senha

#### Estrutura Completa de Referência

A estrutura completa do arquivo `auth-config.json` inclui:

- **emailAndPassword**: Autenticação básica por email/senha
- **socialProviders**: Provedores sociais (Google, GitHub)
- **saml**: Configuração SAML para SSO empresarial
- **emailProviders**: Configuração de provedores de email (Resend, etc.)
- **inviteEmailProviderId**: ID do provedor de email para envio de convites
- **magicLinkConfig**: Configuração de magic links (autenticação via link enviado por email)

### 🛠️ Como Editar

1. **Edite o arquivo localmente**:

```bash
# Abra o seu editor de arquivos com o arquivo e faça as edições
vim auth-config.json
```

2. **Reinicie o container** para carregar as mudanças:

```bash
docker compose restart mesh
```

3. **Ou recrie o container**:

```bash
docker compose up -d --force-recreate mesh
```

### ⚠️ Importante

- O arquivo deve ser um JSON válido
- Se o arquivo não existir, o Docker Compose falhará ao iniciar
- Escolha o arquivo de exemplo adequado às suas necessidades:
  - **Configuração simples**: Use `conf-examples/auth-config.json.example`
  - **SSO e envio de emails**: Use `conf-examples/auth-config-sso-email.json.example`
- Não commite secrets (clientSecret, apiKey) no arquivo em produção

## 🔐 Segurança

### Gerar BETTER_AUTH_SECRET

**⚠️ IMPORTANTE**: Sempre gere um secret seguro em produção:

```bash
# Gerar secret seguro (32+ caracteres)
openssl rand -base64 32

# Adicionar ao .env
BETTER_AUTH_SECRET=seu_secret_gerado_aqui
```

### Proteger arquivo .env

```bash
# Não commitar .env no Git
echo ".env" >> .gitignore

# Definir permissões restritas
chmod 600 .env
```

### Logs

```bash
# Ver logs em tempo real
docker compose logs -f mesh

# Ver últimas 100 linhas
docker compose logs --tail=100 mesh

# Ver logs desde um timestamp
docker compose logs --since 2024-01-01T00:00:00 mesh
```

### Status do Container

```bash
# Ver status
docker compose ps

# Ver detalhes
docker compose ps -a

# Ver uso de recursos
docker stats deco-mcp-mesh
```

### Resetar Volume (Apagar Dados)

Para resetar completamente os dados e começar do zero:

#### Método 1: Usar Docker Compose (Recomendado) ✅

```bash
# Parar containers e remover volumes
docker compose down -v

# Reiniciar com volume vazio
docker compose up -d
```

O flag `-v` remove os volumes nomeados definidos no `docker-compose.yml`.

#### Método 2: Resetar volume específico

```bash
# Parar apenas o serviço
docker compose stop mesh

# Remover volume específico
docker volume rm docker_mesh-data

# Ou se estiver em outro diretório:
docker volume rm helm-chart-deco-mcp-mesh_mesh-data

# Reiniciar (criará novo volume vazio)
docker compose up -d
```

#### Método 3: Backup antes de resetar

```bash
# 1. Fazer backup primeiro
docker compose exec mesh cp /app/data/mesh.db /app/data/mesh.db.backup
docker compose cp mesh:/app/data/mesh.db ./backup-$(date +%Y%m%d-%H%M%S).db

# 2. Resetar
docker compose down -v
docker compose up -d
```

#### Método 4: Resetar apenas SQLite (manter outros dados)

Se quiser resetar apenas o banco SQLite mantendo outros arquivos:

```bash
# Entrar no container
docker compose exec mesh sh

# Dentro do container, remover apenas o banco
rm /app/data/mesh.db

# Reiniciar aplicação (recriará o banco)
exit
docker compose restart mesh
```

#### Verificar volumes

```bash
# Listar volumes
docker volume ls | grep mesh

# Ver detalhes de um volume
docker volume inspect docker_mesh-data

# Ver tamanho usado
docker system df -v
```

**⚠️ Atenção**: 
- `docker compose down -v` **apaga todos os dados permanentemente**
- Faça backup antes se tiver dados importantes
- Volumes não são removidos automaticamente quando você faz `docker compose down` (sem `-v`)

## 🔄 Atualização

### Atualizar Imagem

```bash
# Parar aplicação
docker compose down

# Atualizar imagem
docker compose pull

# Reiniciar
docker compose up -d
```

### Atualizar para versão específica

```bash
# Editar .env
IMAGE_TAG=0.1.24

# Atualizar
docker compose pull
docker compose up -d
```

## 📦 Backup e Restore

### Backup (SQLite)

```bash
# Criar backup
docker compose exec mesh cp /app/data/mesh.db /app/data/mesh.db.backup

# Copiar para host
docker compose cp mesh:/app/data/mesh.db ./backup-$(date +%Y%m%d).db
```

### Backup (PostgreSQL)

```bash
# Backup do banco
docker compose exec postgres pg_dump -U mesh_user mesh_db > backup-$(date +%Y%m%d).sql

# Restore
docker compose exec -T postgres psql -U mesh_user mesh_db < backup-20240101.sql
```
