import { View } from 'react-native';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type ChartPoint = {
  label: string;
  volume: number;
  etp: number;
};

export default function CombinedChart({ points }: { points: ChartPoint[] }) {
  const dense = points.length > 16;
  return (
    <View style={{ width: '100%', height: dense ? 340 : 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: dense ? 16 : 0 }}>
          <CartesianGrid stroke="#E6E9EE" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#687581', fontSize: 11 }}
            interval={0}
            angle={dense ? -40 : 0}
            textAnchor={dense ? 'end' : 'middle'}
            height={dense ? 54 : 30}
          />
          <YAxis yAxisId="volume" domain={[0, 'auto']} tick={{ fill: '#0F2D46', fontSize: 11 }} width={48} />
          <YAxis yAxisId="etp" orientation="right" domain={[0, 'auto']} allowDecimals={false} tick={{ fill: '#2E8F86', fontSize: 11 }} width={36} />
          <Tooltip formatter={(value, name) => [Number(value).toLocaleString('fr-FR'), name]} />
          <Legend />
          <Area yAxisId="volume" type="monotone" dataKey="volume" name="Volume prévu" stroke="#0F2D46" fill="#0F2D46" fillOpacity={0.18} strokeWidth={2} />
          <Line yAxisId="etp" type="monotone" dataKey="etp" name="ETP requis" stroke="#2E8F86" strokeWidth={3} dot={{ r: 4, fill: '#2E8F86', stroke: '#FFFFFF', strokeWidth: 1 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </View>
  );
}
