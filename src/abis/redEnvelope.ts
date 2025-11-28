export const redEnvelopeAbi = [
  {
    inputs: [
      { internalType: 'uint8', name: 'totalSlots', type: 'uint8' },
      { internalType: 'bool', name: 'equalShare', type: 'bool' },
    ],
    name: 'createEnvelope',
    outputs: [{ internalType: 'uint256', name: 'envelopeId', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'envelopeId', type: 'uint256' }],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'envelopeId', type: 'uint256' },
      { internalType: 'address', name: 'user', type: 'address' },
    ],
    name: 'claimed',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'envelopeId', type: 'uint256' }],
    name: 'getEnvelope',
    outputs: [
      { internalType: 'address', name: 'creator', type: 'address' },
      { internalType: 'uint256', name: 'totalAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'remainingAmount', type: 'uint256' },
      { internalType: 'uint8', name: 'totalSlots', type: 'uint8' },
      { internalType: 'uint8', name: 'remainingSlots', type: 'uint8' },
      { internalType: 'bool', name: 'equalShare', type: 'bool' },
      { internalType: 'uint64', name: 'createdAt', type: 'uint64' },
      { internalType: 'bool', name: 'reclaimed', type: 'bool' },
      { internalType: 'bool', name: 'expired', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'envelopeId', type: 'uint256' }],
    name: 'reclaimExpired',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
