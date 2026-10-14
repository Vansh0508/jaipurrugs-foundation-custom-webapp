"use client";

import { Tabs } from "@heroui/react";

export function PartnersTabs({ partners, reviews }: { partners: React.ReactNode; reviews: React.ReactNode }) {
  return (
    <Tabs variant="secondary" defaultSelectedKey="partners">
      <Tabs.ListContainer>
        <Tabs.List aria-label="Partners and reviews">
          <Tabs.Tab id="partners">
            Partners
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="reviews">
            Reviews
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel className="pt-6" id="partners">
        {partners}
      </Tabs.Panel>
      <Tabs.Panel className="pt-6" id="reviews">
        {reviews}
      </Tabs.Panel>
    </Tabs>
  );
}
