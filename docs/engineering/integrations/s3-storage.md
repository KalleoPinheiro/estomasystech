---
title: "Integração: armazenamento de fotos (S3 / R2 / MinIO)"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# Armazenamento de fotos (S3 / R2 / MinIO)

## Propósito

Guarda as fotos de condição clínica ([prontuário](../../domains/pacientes-prontuario/README.md))
num bucket privado S3-compatível. **Obrigatório com mais de uma réplica** — disco local não é
compartilhado.

| Campo | Valor |
| --- | --- |
| Direção | saída |
| Obrigatória? | não com uma réplica (padrão: disco local em `UPLOADS_DIR`) |
| Gateway | `src/infrastructure/storage/s3-photo-storage.ts` (`@aws-sdk/client-s3`) · `local-photo-storage.ts` |
| Porta | `src/application/ports/photo-storage.ts` |

## Credenciais

| Credencial | Obrigatória com `PHOTO_STORAGE=s3` | Nota |
| --- | --- | --- |
| `PHOTO_STORAGE` | — | `s3` liga o bucket; qualquer outro valor usa disco |
| `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | sim | — |
| `S3_REGION` | não | padrão `auto` (R2); AWS: ex. `sa-east-1` |
| `S3_ENDPOINT` | não | vazio = AWS; R2: `https://<conta>.r2.cloudflarestorage.com` |
| `S3_FORCE_PATH_STYLE` | não | `true` para MinIO |

## Contrato

- Chave do objeto: `<clinic_id>/condition-photos/<id>` — a mesma no disco e no bucket.
- Bucket **privado**: a foto é servida pela API com autorização, nunca por URL pública.
- Metadados (EXIF/GPS) removidos antes de gravar (AD-002).

## Modos de falha

| Situação | Comportamento | Visível para |
| --- | --- | --- |
| `PHOTO_STORAGE=s3` sem uma variável obrigatória | falha na inicialização nomeando as que faltam — **nunca** cai para disco em silêncio | log de boot |
| bucket indisponível | upload/leitura da foto falha com erro | usuário da tela de fotos |

## Teste local

```bash
# MinIO local
docker run -p 9000:9000 -e MINIO_ROOT_USER=minio -e MINIO_ROOT_PASSWORD=minio123 minio/minio server /data
# .env: PHOTO_STORAGE=s3 S3_BUCKET=estomasystech S3_ACCESS_KEY_ID=minio S3_SECRET_ACCESS_KEY=minio123
#       S3_ENDPOINT=http://localhost:9000 S3_FORCE_PATH_STYLE=true
```
