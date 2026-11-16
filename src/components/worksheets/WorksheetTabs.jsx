import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function WorksheetTabs({ activeTab, onTabChange, assignedCount, completedCount, scheduledCount }) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="grid grid-cols-3 mb-4">
        <TabsTrigger value="assigned" className="text-xs">
          Assigned ({assignedCount})
        </TabsTrigger>
        <TabsTrigger value="completed" className="text-xs">
          Completed ({completedCount})
        </TabsTrigger>
        <TabsTrigger value="scheduled" className="text-xs">
          Scheduled ({scheduledCount})
        </TabsTrigger>
      </TabsList>
      
      <TabsContent value="assigned" />
      <TabsContent value="completed" />
      <TabsContent value="scheduled" />
    </Tabs>
  );
}