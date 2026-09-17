import React, { useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface Role {
  id: string;
  name: string;
}

interface Board {
  id: string;
  name: string;
}

interface BoardAccess {
  boardId: string;
  roleId: string;
  canRead: boolean;
  canWrite: boolean;
}

interface PermissionGraphProps {
  roles: Role[];
  boards: Board[];
  accesses: BoardAccess[];
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#4f46e5',
  manager: '#0891b2',
  user: '#059669',
  guest: '#d97706',
};

export const PermissionGraph: React.FC<PermissionGraphProps> = ({ roles, boards, accesses }) => {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Role nodes (left column)
    roles.forEach((role, i) => {
      nodes.push({
        id: `role-${role.id}`,
        type: 'default',
        position: { x: 0, y: i * 100 },
        data: { label: `👤 ${role.name}` },
        style: {
          background: ROLE_COLORS[role.id] || '#6366f1',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '13px',
          padding: '8px 16px',
          width: 120,
        },
      });
    });

    // Board nodes (right column)
    boards.forEach((board, i) => {
      nodes.push({
        id: `board-${board.id}`,
        type: 'default',
        position: { x: 300, y: i * 100 },
        data: { label: `📋 ${board.name}` },
        style: {
          background: '#f8fafc',
          border: '2px solid #e2e8f0',
          borderRadius: '8px',
          fontSize: '13px',
          padding: '8px 16px',
          width: 140,
        },
      });
    });

    // Edges from accesses
    accesses.forEach(access => {
      if (!access.canRead) return;
      edges.push({
        id: `edge-${access.roleId}-${access.boardId}`,
        source: `role-${access.roleId}`,
        target: `board-${access.boardId}`,
        label: access.canWrite ? '읽기+쓰기' : '읽기만',
        style: {
          stroke: access.canWrite ? '#4f46e5' : '#94a3b8',
          strokeDasharray: access.canWrite ? undefined : '5,5',
        },
        labelStyle: { fontSize: 10, fill: '#64748b' },
        animated: access.canWrite,
      });
    });

    return { nodes, edges };
  }, [roles, boards, accesses]);

  return (
    <div
      style={{ height: 500 }}
      className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-900"
    >
      <ReactFlow nodes={nodes} edges={edges} fitView attributionPosition="bottom-right">
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};
