#!/usr/bin/env bash
set -euo pipefail

# Yandex Cloud quick bootstrap (Variant A).
# Creates VPC/subnet/SG, Managed PostgreSQL, and one VM with cloud-init.
#
# Usage:
#   1) Fill variables below
#   2) chmod +x deploy/yc/yc-quickstart.sh
#   3) ./deploy/yc/yc-quickstart.sh
#
# Requirements:
# - yc CLI configured (yc init)
# - jq installed
# - SSH public key exists

### ====== EDIT THESE VARIABLES ======
FOLDER_ID="${FOLDER_ID:-}"
ZONE="${ZONE:-ru-central1-a}"

NETWORK_NAME="${NETWORK_NAME:-coffee-stop-net}"
SUBNET_NAME="${SUBNET_NAME:-coffee-stop-subnet-a}"
SUBNET_CIDR="${SUBNET_CIDR:-10.10.0.0/24}"
SEC_GROUP_NAME="${SEC_GROUP_NAME:-coffee-stop-sg}"

VM_NAME="${VM_NAME:-coffee-stop-prod-vm}"
VM_CORES="${VM_CORES:-2}"
VM_MEMORY_GB="${VM_MEMORY_GB:-4}"
VM_DISK_GB="${VM_DISK_GB:-60}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/id_rsa.pub}"
CLOUD_INIT_PATH="${CLOUD_INIT_PATH:-deploy/yc/cloud-init.yaml}"

PG_CLUSTER_NAME="${PG_CLUSTER_NAME:-coffee-stop-pg}"
PG_DB_NAME="${PG_DB_NAME:-coffeestop}"
PG_USER="${PG_USER:-coffeestop}"
PG_PASSWORD="${PG_PASSWORD:-}"
### ====== /EDIT ======

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: command '$1' not found."
    exit 1
  }
}

require_cmd yc
require_cmd jq

if [[ -z "$FOLDER_ID" ]]; then
  echo "ERROR: FOLDER_ID is empty. Export it before run."
  exit 1
fi

if [[ -z "$PG_PASSWORD" ]]; then
  echo "ERROR: PG_PASSWORD is empty. Export it before run."
  exit 1
fi

if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo "ERROR: SSH key not found: $SSH_KEY_PATH"
  exit 1
fi

if [[ ! -f "$CLOUD_INIT_PATH" ]]; then
  echo "ERROR: cloud-init file not found: $CLOUD_INIT_PATH"
  exit 1
fi

echo "==> Set folder-id"
yc config set folder-id "$FOLDER_ID"

echo "==> Create VPC network (if missing)"
if ! yc vpc network get "$NETWORK_NAME" >/dev/null 2>&1; then
  yc vpc network create --name "$NETWORK_NAME"
fi

echo "==> Create subnet (if missing)"
if ! yc vpc subnet get "$SUBNET_NAME" >/dev/null 2>&1; then
  yc vpc subnet create \
    --name "$SUBNET_NAME" \
    --zone "$ZONE" \
    --range "$SUBNET_CIDR" \
    --network-name "$NETWORK_NAME"
fi

echo "==> Create security group (if missing)"
if ! yc vpc security-group get "$SEC_GROUP_NAME" >/dev/null 2>&1; then
  yc vpc security-group create \
    --name "$SEC_GROUP_NAME" \
    --network-name "$NETWORK_NAME" \
    --rule "direction=ingress,protocol=tcp,port=22,v4-cidrs=[0.0.0.0/0],description=ssh" \
    --rule "direction=ingress,protocol=tcp,port=80,v4-cidrs=[0.0.0.0/0],description=http" \
    --rule "direction=ingress,protocol=tcp,port=443,v4-cidrs=[0.0.0.0/0],description=https" \
    --rule "direction=egress,protocol=any,v4-cidrs=[0.0.0.0/0],description=all-egress"
fi
SG_ID="$(yc vpc security-group get "$SEC_GROUP_NAME" --format json | jq -r '.id')"

echo "==> Create Managed PostgreSQL cluster (if missing)"
if ! yc managed-postgresql cluster get "$PG_CLUSTER_NAME" >/dev/null 2>&1; then
  yc managed-postgresql cluster create "$PG_CLUSTER_NAME" \
    --environment production \
    --network-name "$NETWORK_NAME" \
    --host "zone-id=$ZONE,subnet-name=$SUBNET_NAME,assign-public-ip=false" \
    --resource-preset s2.micro \
    --disk-size 20 \
    --disk-type network-ssd
fi

echo "==> Create DB/user and grant"
if ! yc managed-postgresql database get --cluster-name "$PG_CLUSTER_NAME" --name "$PG_DB_NAME" >/dev/null 2>&1; then
  yc managed-postgresql database create \
    --cluster-name "$PG_CLUSTER_NAME" \
    --name "$PG_DB_NAME"
fi

if ! yc managed-postgresql user get --cluster-name "$PG_CLUSTER_NAME" --name "$PG_USER" >/dev/null 2>&1; then
  yc managed-postgresql user create \
    --cluster-name "$PG_CLUSTER_NAME" \
    --name "$PG_USER" \
    --password "$PG_PASSWORD"
fi

yc managed-postgresql user grant-permission \
  --cluster-name "$PG_CLUSTER_NAME" \
  --name "$PG_USER" \
  --permission "database-name=$PG_DB_NAME" >/dev/null 2>&1 || true

PG_FQDN="$(yc managed-postgresql host list --cluster-name "$PG_CLUSTER_NAME" --format json | jq -r '.[0].name')"

echo "==> Create VM (if missing)"
if ! yc compute instance get "$VM_NAME" >/dev/null 2>&1; then
  yc compute instance create \
    --name "$VM_NAME" \
    --zone "$ZONE" \
    --platform standard-v3 \
    --cores "$VM_CORES" \
    --memory "$VM_MEMORY_GB" \
    --create-boot-disk "image-family=ubuntu-2204-lts,size=$VM_DISK_GB,type=network-ssd" \
    --network-interface "subnet-name=$SUBNET_NAME,nat-ip-version=ipv4,security-group-ids=$SG_ID" \
    --metadata-from-file "user-data=$CLOUD_INIT_PATH" \
    --ssh-key "$SSH_KEY_PATH"
fi

VM_IP="$(yc compute instance get "$VM_NAME" --format json | jq -r '.network_interfaces[0].primary_v4_address.one_to_one_nat.address')"

cat <<EOF

================= DONE =================
VM name:           $VM_NAME
VM public IP:      $VM_IP
PostgreSQL FQDN:   $PG_FQDN
Database:          $PG_DB_NAME
User:              $PG_USER

Next steps:
1) Create DNS A records:
   guest.<domain>   -> $VM_IP
   barista.<domain> -> $VM_IP
   api.<domain>     -> $VM_IP
2) SSH to VM:
   ssh ubuntu@$VM_IP
3) Deploy project in /opt/coffee-stop and fill .env.prod
4) Use DATABASE_URL:
   postgresql+psycopg://$PG_USER:<password>@$PG_FQDN:6432/$PG_DB_NAME
========================================
EOF
