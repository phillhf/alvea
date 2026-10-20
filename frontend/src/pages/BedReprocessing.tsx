import { useTranslation } from "react-i18next";
import StationsOverview from "../components/StationsOverview";

export default function BedReprocessing() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <StationsOverview
        category="bed_cleaning"
        title={t("nav.beds")}
        stationLinkPrefix="/stations"
      />
    </div>
  );
}
