import { View } from 'react-native';

type ChartPoint = {
  label: string;
  volume: number;
  etp: number;
};

export default function CombinedChart({ points }: { points: ChartPoint[] }) {
  const maxVolume = Math.max(...points.map((point) => point.volume), 1);
  const maxEtp = Math.max(...points.map((point) => point.etp), 1);
  return (
    <View style={{ width: '100%', height: 180, flexDirection: 'row', alignItems: 'flex-end' }}>
      {points.map((point) => (
        <View key={point.label} style={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
          <View style={{ position: 'absolute', bottom: Math.max(8, (point.etp / maxEtp) * 150), width: 8, height: 8, borderRadius: 4, backgroundColor: '#2E8F86' }} />
          <View style={{ width: '55%', height: Math.max(4, (point.volume / maxVolume) * 150), backgroundColor: '#0F2D46', borderTopLeftRadius: 3, borderTopRightRadius: 3, opacity: 0.85 }} />
        </View>
      ))}
    </View>
  );
}
