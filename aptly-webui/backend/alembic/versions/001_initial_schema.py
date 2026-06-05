"""Initial schema

Revision ID: 001
Revises:
Create Date: 2024-06-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create UUID extension
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=True),
        sa.Column('full_name', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_superuser', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('role', sa.String(50), nullable=False, server_default='viewer'),
        sa.Column('auth_provider', sa.String(50), nullable=False, server_default='local'),
        sa.Column('external_id', sa.String(255), nullable=True),
        sa.Column('last_login', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )

    # aptly_instances table
    op.create_table(
        'aptly_instances',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('instance_type', sa.String(50), nullable=False, server_default='host'),
        sa.Column('host', sa.String(255), nullable=True),
        sa.Column('port', sa.Integer(), nullable=True),
        sa.Column('api_path', sa.String(255), nullable=False, server_default='/api'),
        sa.Column('use_ssl', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('verify_ssl', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('auth_method', sa.String(50), nullable=False, server_default='none'),
        sa.Column('auth_config', postgresql.JSONB(), nullable=True),
        sa.Column('docker_host', sa.String(255), nullable=True),
        sa.Column('docker_container', sa.String(255), nullable=True),
        sa.Column('cli_path', sa.String(255), nullable=False, server_default='/usr/bin/aptly'),
        sa.Column('working_directory', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('is_reachable', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('last_seen', sa.DateTime(timezone=True), nullable=True),
        sa.Column('version', sa.String(50), nullable=True),
        sa.Column('config', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    # mirror_configs table
    op.create_table(
        'mirror_configs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('aptly_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('aptly_uuid', sa.String(255), nullable=True),
        sa.Column('distribution', sa.String(100), nullable=True),
        sa.Column('components', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('architectures', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('source_url', sa.Text(), nullable=False),
        sa.Column('source_type', sa.String(50), nullable=False, server_default='standard'),
        sa.Column('filter_config', postgresql.JSONB(), nullable=True),
        sa.Column('esm_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('esm_token_encrypted', sa.Text(), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_sync', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sync_status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('package_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('download_size_bytes', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['aptly_id'], ['aptly_instances.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('aptly_id', 'name'),
    )

    # snapshots table
    op.create_table(
        'snapshots',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('aptly_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('aptly_uuid', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('source_type', sa.String(50), nullable=True),
        sa.Column('source_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('package_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('size_bytes', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['aptly_id'], ['aptly_instances.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('aptly_id', 'name'),
    )

    # publishes table
    op.create_table(
        'publishes',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('aptly_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('snapshot_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('distribution', sa.String(100), nullable=False),
        sa.Column('component', sa.String(100), nullable=False),
        sa.Column('prefix', sa.String(255), nullable=False, server_default='.'),
        sa.Column('gpg_key_id', sa.String(255), nullable=True),
        sa.Column('is_signed', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('publish_options', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_published', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['aptly_id'], ['aptly_instances.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['snapshot_id'], ['snapshots.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('aptly_id', 'distribution', 'component', 'prefix'),
    )

    # sync_tasks table
    op.create_table(
        'sync_tasks',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('aptly_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('task_type', sa.String(50), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('resource_type', sa.String(50), nullable=True),
        sa.Column('resource_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('progress_percent', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('current_operation', sa.Text(), nullable=True),
        sa.Column('logs', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('result_data', postgresql.JSONB(), nullable=True),
        sa.Column('queued_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('started_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['aptly_id'], ['aptly_instances.id']),
        sa.ForeignKeyConstraint(['resource_id'], ['mirror_configs.id']),
        sa.ForeignKeyConstraint(['started_by'], ['users.id']),
    )

    # audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('user_email', sa.String(255), nullable=True),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('resource_type', sa.String(100), nullable=False),
        sa.Column('resource_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('resource_name', sa.String(255), nullable=True),
        sa.Column('details', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
    )

    # search_cache table
    op.create_table(
        'search_cache',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('query_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('query_params', postgresql.JSONB(), nullable=False),
        sa.Column('results', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('result_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # packages table
    op.create_table(
        'packages',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('aptly_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('aptly_key', sa.String(255), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('version', sa.String(100), nullable=False),
        sa.Column('architecture', sa.String(50), nullable=True),
        sa.Column('source', sa.String(255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('section', sa.String(100), nullable=True),
        sa.Column('priority', sa.String(50), nullable=True),
        sa.Column('size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('sha256', sa.String(64), nullable=True),
        sa.Column('md5', sa.String(32), nullable=True),
        sa.Column('depends', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('recommends', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('suggests', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('conflicts', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('provides', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('replaces', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
        sa.Column('homepage', sa.Text(), nullable=True),
        sa.Column('maintainer', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['aptly_id'], ['aptly_instances.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('aptly_id', 'aptly_key'),
    )

    # Create indexes
    op.create_index('idx_packages_name', 'packages', ['name'])
    op.create_index('idx_packages_name_version', 'packages', ['name', 'version'])
    op.create_index('idx_packages_aptly_key', 'packages', ['aptly_id', 'aptly_key'])
    op.create_index('idx_snapshots_name', 'snapshots', ['name'])
    op.create_index('idx_mirror_configs_aptly', 'mirror_configs', ['aptly_id'])
    op.create_index('idx_audit_logs_timestamp', 'audit_logs', ['timestamp'])
    op.create_index('idx_audit_logs_user', 'audit_logs', ['user_id'])
    op.create_index('idx_audit_logs_resource', 'audit_logs', ['resource_type', 'resource_id'])
    op.create_index('idx_sync_tasks_status', 'sync_tasks', ['status'])


def downgrade() -> None:
    op.drop_index('idx_sync_tasks_status', table_name='sync_tasks')
    op.drop_index('idx_audit_logs_resource', table_name='audit_logs')
    op.drop_index('idx_audit_logs_user', table_name='audit_logs')
    op.drop_index('idx_audit_logs_timestamp', table_name='audit_logs')
    op.drop_index('idx_mirror_configs_aptly', table_name='mirror_configs')
    op.drop_index('idx_snapshots_name', table_name='snapshots')
    op.drop_index('idx_packages_aptly_key', table_name='packages')
    op.drop_index('idx_packages_name_version', table_name='packages')
    op.drop_index('idx_packages_name', table_name='packages')

    op.drop_table('packages')
    op.drop_table('search_cache')
    op.drop_table('audit_logs')
    op.drop_table('sync_tasks')
    op.drop_table('publishes')
    op.drop_table('snapshots')
    op.drop_table('mirror_configs')
    op.drop_table('aptly_instances')
    op.drop_table('users')
