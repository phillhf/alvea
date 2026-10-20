import StationsOverview from "../components/StationsOverview";

export default function RoomCleaning() {
  return (
    <StationsOverview
      category="room_cleaning"
      title="🧹 Scheuer-Wisch"
      stationLinkPrefix="/rooms/stations"
    />
  );
}
